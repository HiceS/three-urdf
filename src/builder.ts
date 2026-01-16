/**
 * Converts a parsed RobotModel into a Three.js Object3D hierarchy
 */

import {
  Object3D,
  Group,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  LineSegments,
  BufferGeometry,
  LineBasicMaterial,
  Vector3,
  Euler,
  Quaternion,
  Color,
} from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import type { RobotModel, Joint, RPY, Visual, Material } from './types';

/**
 * Options for building the robot Object3D
 */
export interface BuildRobotOptions {
  /** radius of joint spheres for debug mode (default: 0.02) */
  jointRadius?: number;
  /** color of joint spheres for debug mode (default: 0xff0000) */
  jointColor?: number;
  /** color of link lines for debug mode (default: 0x00ff00) */
  linkColor?: number;
  /** convert from URDF Z-up to Three.js Y-up (default: true) */
  convertToYUp?: boolean;
  /** show debug visualization (spheres and lines) (default: true for buildRobot, false for loadRobot) */
  showDebug?: boolean;
}

/**
 * Extended Object3D that stores joint metadata for animation
 */
export interface URDFJoint extends Object3D {
  jointType: Joint['type'];
  axis: Vector3;
  jointName: string;
  limits?: { lower?: number; upper?: number };
  jointValue: number;
  /** set the joint angle/position and update the transform */
  setJointValue: (value: number) => void;
}

/**
 * The root robot object with helper methods
 */
export interface URDFRobot extends Group {
  /** map of joint name -> URDFJoint object */
  joints: Map<string, URDFJoint>;
  /** map of link name -> Object3D */
  links: Map<string, Object3D>;
  /** set all joint values at once */
  setJointValues: (values: Record<string, number>) => void;
}

/**
 * Convert RPY (roll-pitch-yaw) to Three.js Euler
 * URDF uses extrinsic XYZ rotations ("fixed axis"), which is equivalent to intrinsic ZYX
 */
function rpyToEuler(rpy: RPY): Euler {
  return new Euler(rpy.r, rpy.p, rpy.y, 'ZYX');
}

/**
 * Create a debug sphere mesh for visualizing joints
 */
function createJointSphere(radius: number, color: number): Mesh {
  const geometry = new SphereGeometry(radius, 8, 8);
  const material = new MeshBasicMaterial({ color });
  return new Mesh(geometry, material);
}

/**
 * Create a line from origin to a point
 */
function createLinkLine(target: Vector3, color: number): LineSegments {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(0, 0, 0),
    target.clone(),
  ]);
  const material = new LineBasicMaterial({ color });
  return new LineSegments(geometry, material);
}

/**
 * Get Three.js material from URDF material definition
 */
function getMaterial(
  visual: Visual,
  materials: Map<string, Material>
): MeshStandardMaterial {
  let urdfMaterial: Material | undefined;
  
  if (typeof visual.material === 'string') {
    urdfMaterial = materials.get(visual.material);
  } else if (visual.material) {
    urdfMaterial = visual.material;
  }

  const mat = new MeshStandardMaterial({
    color: urdfMaterial?.color 
      ? new Color(urdfMaterial.color.r, urdfMaterial.color.g, urdfMaterial.color.b)
      : 0x888888,
    metalness: 0.3,
    roughness: 0.6,
  });

  if (urdfMaterial?.color?.a !== undefined && urdfMaterial.color.a < 1) {
    mat.transparent = true;
    mat.opacity = urdfMaterial.color.a;
  }

  return mat;
}

/**
 * Build the robot structure (synchronous, used internally)
 */
function buildRobotStructure(
  model: RobotModel,
  options: BuildRobotOptions
): URDFRobot {
  const {
    jointRadius = 0.02,
    jointColor = 0xff0000,
    linkColor = 0x00ff00,
    convertToYUp = true,
    showDebug = true,
  } = options;

  const robot = new Group() as URDFRobot;
  robot.name = model.name;
  robot.joints = new Map();
  robot.links = new Map();

  if (convertToYUp) {
    robot.rotation.x = -Math.PI / 2;
  }

  robot.setJointValues = (values: Record<string, number>) => {
    for (const [name, value] of Object.entries(values)) {
      const joint = robot.joints.get(name);
      if (joint) {
        joint.setJointValue(value);
      }
    }
  };

  const jointsByParent = new Map<string, Joint[]>();
  for (const joint of model.joints.values()) {
    const list = jointsByParent.get(joint.parent) || [];
    list.push(joint);
    jointsByParent.set(joint.parent, list);
  }

  function buildLink(linkName: string, parentObject: Object3D) {
    const link = model.links.get(linkName);
    if (!link) return;

    const linkGroup = new Group();
    linkGroup.name = `link_${linkName}`;
    parentObject.add(linkGroup);
    robot.links.set(linkName, linkGroup);

    if (showDebug) {
      const sphere = createJointSphere(jointRadius, jointColor);
      sphere.name = `debug_sphere_${linkName}`;
      linkGroup.add(sphere);
    }

    const childJoints = jointsByParent.get(linkName) || [];

    for (const jointData of childJoints) {
      const jointObject = new Object3D() as URDFJoint;
      jointObject.name = `joint_${jointData.name}`;
      jointObject.jointType = jointData.type;
      jointObject.jointName = jointData.name;
      jointObject.axis = jointData.axis?.xyz.clone().normalize() || new Vector3(0, 0, 1);
      jointObject.limits = jointData.limits;
      jointObject.jointValue = 0;

      jointObject.position.copy(jointData.origin.xyz);
      
      // store the origin quaternion for composing rotations
      const originQuaternion = new Quaternion().setFromEuler(rpyToEuler(jointData.origin.rpy));
      jointObject.quaternion.copy(originQuaternion);

      if (showDebug) {
        const line = createLinkLine(jointData.origin.xyz, linkColor);
        line.name = `debug_line_${jointData.name}`;
        linkGroup.add(line);
      }

      jointObject.setJointValue = (value: number) => {
        if (jointData.limits) {
          if (jointData.limits.lower !== undefined && value < jointData.limits.lower) {
            value = jointData.limits.lower;
          }
          if (jointData.limits.upper !== undefined && value > jointData.limits.upper) {
            value = jointData.limits.upper;
          }
        }
        jointObject.jointValue = value;

        const axis = jointObject.axis;

        switch (jointData.type) {
          case 'revolute':
          case 'continuous': {
            // compose: origin rotation * axis rotation
            const axisQuat = new Quaternion().setFromAxisAngle(axis, value);
            jointObject.quaternion.copy(originQuaternion).multiply(axisQuat);
            break;
          }
          case 'prismatic':
            jointObject.position.copy(jointData.origin.xyz);
            jointObject.position.addScaledVector(axis, value);
            break;
        }
      };

      linkGroup.add(jointObject);
      robot.joints.set(jointData.name, jointObject);

      buildLink(jointData.child, jointObject);
    }
  }

  if (model.rootLink) {
    buildLink(model.rootLink, robot);
  }

  return robot;
}

/**
 * Build a Three.js Object3D hierarchy from a parsed RobotModel (debug visualization only)
 */
export function buildRobot(model: RobotModel, options: BuildRobotOptions = {}): URDFRobot {
  return buildRobotStructure(model, { ...options, showDebug: true });
}

/**
 * Load a robot with actual meshes from the URDF
 * Returns a promise that resolves when all meshes are loaded
 */
export async function loadRobot(
  model: RobotModel,
  options: BuildRobotOptions = {}
): Promise<URDFRobot> {
  const { showDebug = false, ...restOptions } = options;
  
  const robot = buildRobotStructure(model, { ...restOptions, showDebug });
  
  const stlLoader = new STLLoader();
  const loadPromises: Promise<void>[] = [];

  // load meshes for each link
  for (const [linkName, link] of model.links) {
    const linkGroup = robot.links.get(linkName);
    if (!linkGroup) continue;

    for (const visual of link.visuals) {
      if (visual.geometry.type !== 'mesh') continue;

      const meshFilename = visual.geometry.filename;
      if (!meshFilename) continue;

      const loadPromise = new Promise<void>((resolve) => {
        stlLoader.load(
          meshFilename,
          (geometry) => {
            const material = getMaterial(visual, model.materials);
            const mesh = new Mesh(geometry, material);
            mesh.name = `visual_${linkName}_${visual.name || 'mesh'}`;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // apply visual origin transform
            mesh.position.copy(visual.origin.xyz);
            mesh.rotation.copy(rpyToEuler(visual.origin.rpy));

            // apply scale if specified
            if (visual.geometry.type === 'mesh' && visual.geometry.scale) {
              mesh.scale.copy(visual.geometry.scale);
            }

            linkGroup.add(mesh);
            resolve();
          },
          undefined,
          (error) => {
            console.warn(`Failed to load mesh ${meshFilename}:`, error);
            resolve(); // don't reject, just skip failed meshes
          }
        );
      });

      loadPromises.push(loadPromise);
    }
  }

  await Promise.all(loadPromises);
  
  return robot;
}
