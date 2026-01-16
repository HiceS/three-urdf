import { readFileSync } from 'fs';
import { join } from 'path';
import { Matrix4, Vector3, Euler } from 'three';
import { parseURDF } from '../src/parser';
import type { RobotModel, Joint } from '../src/types';

const projectRoot = process.cwd();
const urdfPath = join(projectRoot, 'models/kuka_iiwa/iiwa14.urdf');
const urdfString = readFileSync(urdfPath, 'utf-8');

const model = parseURDF(urdfString, {
  packageMap: {
    'iiwa_description': join(projectRoot, 'models/kuka_iiwa/iiwa_description'),
  },
});

// compute world positions of joints by traversing kinematic tree
function computeJointWorldPositions(robot: RobotModel): Map<string, Vector3> {
  const worldPositions = new Map<string, Vector3>();
  const visitedLinks = new Set<string>();
  
  // build map: parent link -> joints (to find joints connected from a link)
  const linkToJoints = new Map<string, Joint[]>();
  for (const joint of robot.joints.values()) {
    if (!linkToJoints.has(joint.parent)) {
      linkToJoints.set(joint.parent, []);
    }
    linkToJoints.get(joint.parent)!.push(joint);
  }
  
  // recursive function to traverse kinematic tree
  function traverse(linkName: string, linkTransform: Matrix4) {
    if (visitedLinks.has(linkName)) return;
    visitedLinks.add(linkName);
    
    // find all joints that have this link as parent
    const joints = linkToJoints.get(linkName) || [];
    for (const joint of joints) {
      // create transformation matrix for this joint's origin
      // In URDF, origin specifies the pose of child frame relative to parent frame
      // The transformation means: child frame is at xyz in parent frame, rotated by rpy
      // To transform a point from child to parent: p_parent = R * p_child + T
      // So the transformation matrix is: [R | T] where R rotates, T translates
      
      // create rotation matrix (RPY: roll around X, pitch around Y, yaw around Z)
      // In URDF, RPY is applied in fixed frame order: roll (X), pitch (Y), yaw (Z)
      // In Three.js Euler, this corresponds to 'XYZ' order
      const euler = new Euler(
        joint.origin.rpy.r, // roll (X)
        joint.origin.rpy.p,  // pitch (Y)
        joint.origin.rpy.y,  // yaw (Z)
        'XYZ'
      );
      const rotationMatrix = new Matrix4().makeRotationFromEuler(euler);
      
      // create translation vector (directly from URDF, no rotation applied)
      const translation = new Vector3(
        joint.origin.xyz.x,
        joint.origin.xyz.y,
        joint.origin.xyz.z
      );
      
      // build joint transformation matrix: [R | T]
      const jointTransform = rotationMatrix.clone();
      jointTransform.setPosition(translation);
      
      // compose with parent link transformation: world = parent * joint
      const worldTransform = linkTransform.clone().multiply(jointTransform);
      
      // extract world position (translation component from matrix)
      const worldPos = new Vector3();
      worldPos.setFromMatrixPosition(worldTransform);
      worldPositions.set(joint.name, worldPos);
      
      // continue traversal to child link
      // The worldTransform now represents the child link's frame in world coordinates
      traverse(joint.child, worldTransform);
    }
  }
  
  // start from root link with identity transformation
  if (robot.rootLink) {
    traverse(robot.rootLink, new Matrix4());
  }
  
  return worldPositions;
}

const jointWorldPositions = computeJointWorldPositions(model);

console.log('=== Robot Model Information ===\n');
console.log(`Robot Name: ${model.name}`);
console.log(`Root Link: ${model.rootLink || 'N/A'}\n`);

console.log(`Materials: ${model.materials.size}`);
for (const [name, material] of model.materials.entries()) {
  if (material.color) {
    console.log(`  - ${name}: rgba(${material.color.r}, ${material.color.g}, ${material.color.b}, ${material.color.a})`);
  } else {
    console.log(`  - ${name}: (no color)`);
  }
}

console.log(`\nLinks: ${model.links.size}`);
for (const [name, link] of model.links.entries()) {
  console.log(`  - ${name}:`);
  console.log(`      Visuals: ${link.visuals.length}`);
  console.log(`      Collisions: ${link.collisions.length}`);
  if (link.inertial) {
    console.log(`      Mass: ${link.inertial.mass} kg`);
  }
  if (link.selfCollision) {
    console.log(`      Self-collision: ${link.selfCollision.geometry.type}`);
  }
}

console.log(`\nJoints: ${model.joints.size}`);
for (const [name, joint] of model.joints.entries()) {
  console.log(`  - ${name}:`);
  console.log(`      Type: ${joint.type}`);
  console.log(`      Parent: ${joint.parent} -> Child: ${joint.child}`);
  console.log(`      Origin (relative to parent): xyz(${joint.origin.xyz.x.toFixed(4)}, ${joint.origin.xyz.y.toFixed(4)}, ${joint.origin.xyz.z.toFixed(4)})`);
  const worldPos = jointWorldPositions.get(name);
  if (worldPos) {
    console.log(`      World Position: xyz(${worldPos.x.toFixed(4)}, ${worldPos.y.toFixed(4)}, ${worldPos.z.toFixed(4)})`);
  }
  if (joint.limits) {
    const limits: string[] = [];
    if (joint.limits.lower !== undefined) limits.push(`lower: ${joint.limits.lower}`);
    if (joint.limits.upper !== undefined) limits.push(`upper: ${joint.limits.upper}`);
    if (joint.limits.effort !== undefined) limits.push(`effort: ${joint.limits.effort}`);
    if (joint.limits.velocity !== undefined) limits.push(`velocity: ${joint.limits.velocity}`);
    if (limits.length > 0) {
      console.log(`      Limits: ${limits.join(', ')}`);
    }
  }
}

console.log('\n=== Parsing Complete ===');
