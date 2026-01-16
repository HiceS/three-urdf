/**
 * URDF-to-Three.js Library
 * 
 * A lightweight TypeScript library for parsing URDF files and generating
 * interactive Three.js 3D robot models.
 */

// Export types
export type {
  RobotModel,
  Link,
  Joint,
  Material,
  Pose,
  RPY,
  Geometry,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshGeometry,
  CapsuleGeometry,
  Inertial,
  Visual,
  Collision,
  JointLimits,
  JointAxis,
  SafetyController,
  JointDynamics,
  JointType,
  ParseURDFOptions,
} from './types';

// Export parser
export { parseURDF } from './parser';

// Export builder
export { buildRobot, loadRobot } from './builder';
export type { BuildRobotOptions, URDFJoint, URDFRobot } from './builder';
