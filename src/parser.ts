/**
 * URDF Parser - Converts URDF XML to typed RobotModel
 * Uses fast-xml-parser for cross-platform XML parsing
 */

import { XMLParser } from 'fast-xml-parser';
import { Vector3 } from 'three';

import type {
  RobotModel,
  Link,
  Joint,
  Material,
  Pose,
  RPY,
  Geometry,
  Inertial,
  Visual,
  Collision,
  JointLimits,
  JointAxis,
  SafetyController,
  JointDynamics,
  ParseURDFOptions,
} from './types';

/**
 * Type for parsed XML element from fast-xml-parser
 */
type XMLElement = {
  [key: string]: any;
  ':@'?: { [key: string]: string }; // attributes
};

/**
 * Parse a space-separated string of 3 numbers into a Three.js Vector3
 */
function parseVector3(str: string): Vector3 {
  const parts = str.trim().split(/\s+/);
  if (parts.length !== 3) {
    throw new Error(`Invalid vector3 format: ${str}`);
  }
  return new Vector3(
    parseFloat(parts[0]),
    parseFloat(parts[1]),
    parseFloat(parts[2])
  );
}

/**
 * Parse a space-separated string of 3 numbers into RPY
 */
function parseRPY(str: string): RPY {
  const parts = str.trim().split(/\s+/);
  if (parts.length !== 3) {
    throw new Error(`Invalid RPY format: ${str}`);
  }
  return {
    r: parseFloat(parts[0]),
    p: parseFloat(parts[1]),
    y: parseFloat(parts[2]),
  };
}

/**
 * Get attributes from an XML element
 */
function getAttributes(element: XMLElement): { [key: string]: string } {
  return element[':@'] || {};
}

/**
 * Get attribute value from an XML element
 */
function getAttribute(element: XMLElement, name: string, defaultValue?: string): string {
  const attrs = getAttributes(element);
  return attrs[name] ?? defaultValue ?? '';
}

/**
 * Get child element by name (returns first match)
 */
function getChild(element: XMLElement, name: string): XMLElement | null {
  const child = element[name];
  if (Array.isArray(child)) {
    return child[0] || null;
  }
  return child || null;
}

/**
 * Get all child elements by name (always returns array)
 */
function getChildren(element: XMLElement, name: string): XMLElement[] {
  const child = element[name];
  if (!child) {
    return [];
  }
  if (Array.isArray(child)) {
    return child;
  }
  return [child];
}

/**
 * Parse origin element (xyz and rpy attributes)
 */
function parseOrigin(element: XMLElement): Pose {
  const attrs = getAttributes(element);
  const xyzStr = attrs.xyz || '0 0 0';
  const rpyStr = attrs.rpy || '0 0 0';
  return {
    xyz: parseVector3(xyzStr), // Returns Three.js Vector3
    rpy: parseRPY(rpyStr),
  };
}

/**
 * Parse color element
 */
function parseColor(element: XMLElement): { r: number; g: number; b: number; a: number } {
  const attrs = getAttributes(element);
  const rgbaStr = attrs.rgba || '0 0 0 1';
  const parts = rgbaStr.trim().split(/\s+/);
  if (parts.length !== 4) {
    throw new Error(`Invalid color format: ${rgbaStr}`);
  }
  return {
    r: parseFloat(parts[0]),
    g: parseFloat(parts[1]),
    b: parseFloat(parts[2]),
    a: parseFloat(parts[3]),
  };
}

/**
 * Parse material element
 */
function parseMaterial(element: XMLElement): Material {
  const name = getAttribute(element, 'name');
  if (!name) {
    throw new Error('Material element missing name attribute');
  }

  const colorEl = getChild(element, 'color');
  const textureEl = getChild(element, 'texture');

  const material: Material = { name };

  if (colorEl) {
    material.color = parseColor(colorEl);
  }

  if (textureEl) {
    const filename = getAttribute(textureEl, 'filename');
    if (filename) {
      material.texture = filename;
    }
  }

  return material;
}

/**
 * Parse geometry element
 */
function parseGeometry(element: XMLElement, options: ParseURDFOptions): Geometry {
  const boxEl = getChild(element, 'box');
  const cylinderEl = getChild(element, 'cylinder');
  const sphereEl = getChild(element, 'sphere');
  const meshEl = getChild(element, 'mesh');
  const capsuleEl = getChild(element, 'capsule');

  if (boxEl) {
    const sizeStr = getAttribute(boxEl, 'size', '1 1 1');
    return {
      type: 'box',
      size: parseVector3(sizeStr),
    };
  }

  if (cylinderEl) {
    const radius = parseFloat(getAttribute(cylinderEl, 'radius', '0.5'));
    const length = parseFloat(getAttribute(cylinderEl, 'length', '1'));
    return {
      type: 'cylinder',
      radius,
      length,
    };
  }

  if (sphereEl) {
    const radius = parseFloat(getAttribute(sphereEl, 'radius', '0.5'));
    return {
      type: 'sphere',
      radius,
    };
  }

  if (meshEl) {
    let filename = getAttribute(meshEl, 'filename', '');
    
    // Resolve package:// URIs
    if (filename.startsWith('package://')) {
      const match = filename.match(/^package:\/\/([^/]+)\/(.+)$/);
      if (match) {
        const [, packageName, path] = match;
        if (options.packageMap && options.packageMap[packageName]) {
          filename = `${options.packageMap[packageName]}/${path}`;
        } else {
          // Keep package:// format if no mapping provided
          // User can resolve later
        }
      }
    }
    
    // Resolve relative paths
    if (filename && !filename.startsWith('package://') && !filename.startsWith('/') && options.workingPath) {
      filename = `${options.workingPath}/${filename}`;
    }

    const scaleStr = getAttribute(meshEl, 'scale');
    const geometry: Geometry = {
      type: 'mesh',
      filename,
    };

    if (scaleStr) {
      geometry.scale = parseVector3(scaleStr);
    }

    return geometry;
  }

  if (capsuleEl) {
    const radius = parseFloat(getAttribute(capsuleEl, 'radius', '0.5'));
    const length = parseFloat(getAttribute(capsuleEl, 'length', '1'));
    return {
      type: 'capsule',
      radius,
      length,
    };
  }

  throw new Error('Unknown geometry type');
}

/**
 * Parse inertial element
 */
function parseInertial(element: XMLElement): Inertial {
  const originEl = getChild(element, 'origin');
  const massEl = getChild(element, 'mass');
  const inertiaEl = getChild(element, 'inertia');

  const origin = originEl ? parseOrigin(originEl) : { xyz: new Vector3(0, 0, 0), rpy: { r: 0, p: 0, y: 0 } };
  const mass = massEl ? parseFloat(getAttribute(massEl, 'value', '0')) : 0;

  let inertia = {
    ixx: 0,
    ixy: 0,
    ixz: 0,
    iyy: 0,
    iyz: 0,
    izz: 0,
  };

  if (inertiaEl) {
    inertia = {
      ixx: parseFloat(getAttribute(inertiaEl, 'ixx', '0')),
      ixy: parseFloat(getAttribute(inertiaEl, 'ixy', '0')),
      ixz: parseFloat(getAttribute(inertiaEl, 'ixz', '0')),
      iyy: parseFloat(getAttribute(inertiaEl, 'iyy', '0')),
      iyz: parseFloat(getAttribute(inertiaEl, 'iyz', '0')),
      izz: parseFloat(getAttribute(inertiaEl, 'izz', '0')),
    };
  }

  return {
    origin,
    mass,
    inertia,
  };
}

/**
 * Parse visual element
 */
function parseVisual(element: XMLElement, options: ParseURDFOptions): Visual {
  const name = getAttribute(element, 'name');
  const originEl = getChild(element, 'origin');
  const geometryEl = getChild(element, 'geometry');
  const materialEl = getChild(element, 'material');

  if (!geometryEl) {
    throw new Error('Visual element missing geometry');
  }

  const origin = originEl ? parseOrigin(originEl) : { xyz: new Vector3(0, 0, 0), rpy: { r: 0, p: 0, y: 0 } };
  const geometry = parseGeometry(geometryEl, options);

  const visual: Visual = {
    origin,
    geometry,
  };

  if (name) {
    visual.name = name;
  }

  if (materialEl) {
    const materialName = getAttribute(materialEl, 'name');
    if (materialName) {
      visual.material = materialName; // Reference to material
    }
  }

  return visual;
}

/**
 * Parse collision element
 */
function parseCollision(element: XMLElement, options: ParseURDFOptions): Collision {
  const name = getAttribute(element, 'name');
  const originEl = getChild(element, 'origin');
  const geometryEl = getChild(element, 'geometry');

  if (!geometryEl) {
    throw new Error('Collision element missing geometry');
  }

  const origin = originEl ? parseOrigin(originEl) : { xyz: new Vector3(0, 0, 0), rpy: { r: 0, p: 0, y: 0 } };
  const geometry = parseGeometry(geometryEl, options);

  const collision: Collision = {
    origin,
    geometry,
  };

  if (name) {
    collision.name = name;
  }

  return collision;
}

/**
 * Parse link element
 */
function parseLink(element: XMLElement, options: ParseURDFOptions): Link {
  const name = getAttribute(element, 'name');
  if (!name) {
    throw new Error('Link element missing name attribute');
  }

  const link: Link = {
    name,
    visuals: [],
    collisions: [],
  };

  const inertialEl = getChild(element, 'inertial');
  if (inertialEl) {
    link.inertial = parseInertial(inertialEl);
  }

  const visualElements = getChildren(element, 'visual');
  for (const visualEl of visualElements) {
    link.visuals.push(parseVisual(visualEl, options));
  }

  const collisionElements = getChildren(element, 'collision');
  for (const collisionEl of collisionElements) {
    link.collisions.push(parseCollision(collisionEl, options));
  }

  // Handle self_collision_checking (non-standard extension)
  const selfCollisionEl = getChild(element, 'self_collision_checking');
  if (selfCollisionEl) {
    const originEl = getChild(selfCollisionEl, 'origin');
    const geometryEl = getChild(selfCollisionEl, 'geometry');
    if (geometryEl) {
      link.selfCollision = {
        origin: originEl ? parseOrigin(originEl) : { xyz: new Vector3(0, 0, 0), rpy: { r: 0, p: 0, y: 0 } },
        geometry: parseGeometry(geometryEl, options),
      };
    }
  }

  return link;
}

/**
 * Parse joint limits
 */
function parseJointLimits(element: XMLElement): JointLimits {
  const limits: JointLimits = {};
  const attrs = getAttributes(element);

  if (attrs.lower !== undefined) {
    limits.lower = parseFloat(attrs.lower);
  }

  if (attrs.upper !== undefined) {
    limits.upper = parseFloat(attrs.upper);
  }

  if (attrs.effort !== undefined) {
    limits.effort = parseFloat(attrs.effort);
  }

  if (attrs.velocity !== undefined) {
    limits.velocity = parseFloat(attrs.velocity);
  }

  return limits;
}

/**
 * Parse safety controller
 */
function parseSafetyController(element: XMLElement): SafetyController {
  const attrs = getAttributes(element);
  const controller: SafetyController = {};

  if (attrs.soft_lower_limit !== undefined) {
    controller.softLowerLimit = parseFloat(attrs.soft_lower_limit);
  }

  if (attrs.soft_upper_limit !== undefined) {
    controller.softUpperLimit = parseFloat(attrs.soft_upper_limit);
  }

  if (attrs.k_position !== undefined) {
    controller.kPosition = parseFloat(attrs.k_position);
  }

  if (attrs.k_velocity !== undefined) {
    controller.kVelocity = parseFloat(attrs.k_velocity);
  }

  return controller;
}

/**
 * Parse joint dynamics
 */
function parseJointDynamics(element: XMLElement): JointDynamics {
  const attrs = getAttributes(element);
  const dynamics: JointDynamics = {};

  if (attrs.damping !== undefined) {
    dynamics.damping = parseFloat(attrs.damping);
  }

  if (attrs.friction !== undefined) {
    dynamics.friction = parseFloat(attrs.friction);
  }

  return dynamics;
}

/**
 * Parse joint axis
 */
function parseJointAxis(element: XMLElement): JointAxis {
  const xyzStr = getAttribute(element, 'xyz', '0 0 1');
  return {
    xyz: parseVector3(xyzStr),
  };
}

/**
 * Parse joint element
 */
function parseJoint(element: XMLElement, options: ParseURDFOptions): Joint {
  const name = getAttribute(element, 'name');
  if (!name) {
    throw new Error('Joint element missing name attribute');
  }

  const type = getAttribute(element, 'type') as Joint['type'];
  if (!type) {
    throw new Error('Joint element missing type attribute');
  }

  const parentEl = getChild(element, 'parent');
  const childEl = getChild(element, 'child');
  if (!parentEl || !childEl) {
    throw new Error('Joint missing parent or child link');
  }

  const parent = getAttribute(parentEl, 'link');
  const child = getAttribute(childEl, 'link');
  if (!parent || !child) {
    throw new Error('Joint parent or child missing link attribute');
  }

  const originEl = getChild(element, 'origin');
  const origin = originEl ? parseOrigin(originEl) : { xyz: new Vector3(0, 0, 0), rpy: { r: 0, p: 0, y: 0 } };

  const joint: Joint = {
    name,
    type,
    parent,
    child,
    origin,
  };

  const axisEl = getChild(element, 'axis');
  if (axisEl) {
    joint.axis = parseJointAxis(axisEl);
  }

  const limitEl = getChild(element, 'limit');
  if (limitEl) {
    joint.limits = parseJointLimits(limitEl);
  }

  const safetyControllerEl = getChild(element, 'safety_controller');
  if (safetyControllerEl) {
    joint.safetyController = parseSafetyController(safetyControllerEl);
  }

  const dynamicsEl = getChild(element, 'dynamics');
  if (dynamicsEl) {
    joint.dynamics = parseJointDynamics(dynamicsEl);
  }

  const mimicEl = getChild(element, 'mimic');
  if (mimicEl) {
    const jointName = getAttribute(mimicEl, 'joint');
    const multiplier = getAttribute(mimicEl, 'multiplier');
    const offset = getAttribute(mimicEl, 'offset');
    joint.mimic = {
      joint: jointName || '',
      multiplier: multiplier ? parseFloat(multiplier) : undefined,
      offset: offset ? parseFloat(offset) : undefined,
    };
  }

  return joint;
}

/**
 * Main function to parse URDF XML string into a RobotModel
 */
export function parseURDF(urdfString: string, options: ParseURDFOptions = {}): RobotModel {
  // Parse XML using fast-xml-parser which works in both browser and Node.js
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '', // No prefix - attributes will be directly accessible
    attributesGroupName: ':@',
    parseAttributeValue: false,
    trimValues: true,
  });

  const parsed = parser.parse(urdfString);
  
  // fast-xml-parser wraps everything in a root object
  const robotEl = parsed.robot;
  if (!robotEl) {
    throw new Error('URDF document missing <robot> root element');
  }

  const robotName = getAttribute(robotEl, 'name') || 'robot';

  const model: RobotModel = {
    name: robotName,
    materials: new Map(),
    links: new Map(),
    joints: new Map(),
  };

  // Parse materials
  const materialElements = getChildren(robotEl, 'material');
  for (const materialEl of materialElements) {
    const material = parseMaterial(materialEl);
    model.materials.set(material.name, material);
  }

  // Parse links
  const linkElements = getChildren(robotEl, 'link');
  for (const linkEl of linkElements) {
    const link = parseLink(linkEl, options);
    model.links.set(link.name, link);
  }

  // Parse joints
  const jointElements = getChildren(robotEl, 'joint');
  for (const jointEl of jointElements) {
    const joint = parseJoint(jointEl, options);
    model.joints.set(joint.name, joint);
  }

  // Find root link (link with no parent joint)
  const childLinks = new Set<string>();
  for (const joint of model.joints.values()) {
    childLinks.add(joint.child);
  }

  for (const linkName of model.links.keys()) {
    if (!childLinks.has(linkName)) {
      model.rootLink = linkName;
      break;
    }
  }

  return model;
}
