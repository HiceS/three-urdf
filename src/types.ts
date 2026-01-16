/**
 * Type definitions for URDF (Unified Robot Description Format)
 */

import type { Vector3 } from 'three';

/**
 * Rotation in roll-pitch-yaw (RPY) format
 * Note: Three.js uses Euler angles, but URDF uses RPY (roll-pitch-yaw)
 * which is a different convention, so we keep our own type
 */
export interface RPY {
  r: number; // roll
  p: number; // pitch
  y: number; // yaw
}

/**
 * 6D pose (position + orientation)
 */
export interface Pose {
  xyz: Vector3;
  rpy: RPY;
}

/**
 * Color with RGBA values (0-1 range)
 * Compatible with Three.js Color (r, g, b) plus alpha channel
 * Note: This is a plain object, not a Three.js Color instance
 */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number; // alpha (0-1)
}

/**
 * Material definition
 */
export interface Material {
  name: string;
  color?: Color;
  texture?: string;
}

/**
 * Inertial properties of a link
 */
export interface Inertial {
  mass: number;
  origin: Pose;
  inertia: {
    ixx: number;
    ixy: number;
    ixz: number;
    iyy: number;
    iyz: number;
    izz: number;
  };
}

/**
 * Geometry types supported in URDF
 */
export type GeometryType = 'box' | 'cylinder' | 'sphere' | 'mesh' | 'capsule';

/**
 * Box geometry
 */
export interface BoxGeometry {
  type: 'box';
  size: Vector3;
}

/**
 * Cylinder geometry
 */
export interface CylinderGeometry {
  type: 'cylinder';
  radius: number;
  length: number;
}

/**
 * Sphere geometry
 */
export interface SphereGeometry {
  type: 'sphere';
  radius: number;
}

/**
 * Mesh geometry
 */
export interface MeshGeometry {
  type: 'mesh';
  filename: string;
  scale?: Vector3;
}

/**
 * Capsule geometry
 */
export interface CapsuleGeometry {
  type: 'capsule';
  radius: number;
  length: number;
}

/**
 * Union type for all geometry types
 */
export type Geometry =
  | BoxGeometry
  | CylinderGeometry
  | SphereGeometry
  | MeshGeometry
  | CapsuleGeometry;

/**
 * Visual representation of a link
 */
export interface Visual {
  name?: string;
  origin: Pose;
  geometry: Geometry;
  material?: Material | string; // string reference to material name
}

/**
 * Collision representation of a link
 */
export interface Collision {
  name?: string;
  origin: Pose;
  geometry: Geometry;
}

/**
 * Self-collision checking geometry (non-standard extension)
 */
export interface SelfCollision {
  origin: Pose;
  geometry: Geometry;
}

/**
 * A link in the robot model
 */
export interface Link {
  name: string;
  inertial?: Inertial;
  visuals: Visual[];
  collisions: Collision[];
  selfCollision?: SelfCollision;
}

/**
 * Joint types in URDF
 */
export type JointType =
  | 'revolute' // continuous rotation
  | 'continuous' // same as revolute but no limits
  | 'prismatic' // linear motion
  | 'fixed' // no motion
  | 'floating' // 6 DOF
  | 'planar'; // motion in a plane

/**
 * Joint axis definition
 */
export interface JointAxis {
  xyz: Vector3;
}

/**
 * Joint limits
 */
export interface JointLimits {
  lower?: number;
  upper?: number;
  effort?: number;
  velocity?: number;
}

/**
 * Safety controller parameters
 */
export interface SafetyController {
  softLowerLimit?: number;
  softUpperLimit?: number;
  kPosition?: number;
  kVelocity?: number;
}

/**
 * Joint dynamics (damping and friction)
 */
export interface JointDynamics {
  damping?: number;
  friction?: number;
}

/**
 * Mimic joint configuration
 */
export interface JointMimic {
  joint: string;
  multiplier?: number;
  offset?: number;
}

/**
 * A joint connecting two links
 */
export interface Joint {
  name: string;
  type: JointType;
  parent: string; // link name
  child: string; // link name
  origin: Pose;
  axis?: JointAxis;
  limits?: JointLimits;
  safetyController?: SafetyController;
  dynamics?: JointDynamics;
  mimic?: JointMimic;
  calibration?: {
    rising?: number;
    falling?: number;
  };
}

/**
 * Complete robot model parsed from URDF
 */
export interface RobotModel {
  name: string;
  materials: Map<string, Material>;
  links: Map<string, Link>;
  joints: Map<string, Joint>;
  rootLink?: string; // name of the root link (no parent joint)
}

/**
 * Options for parsing URDF
 */
export interface ParseURDFOptions {
  /**
   * Map for resolving package:// URIs to actual paths
   * e.g., { 'iiwa_description': '/models/kuka_iiwa/iiwa_description' }
   */
  packageMap?: Record<string, string>;
  
  /**
   * Base path for resolving relative mesh paths
   */
  workingPath?: string;
  
  /**
   * Whether to ignore Gazebo-specific extensions
   */
  ignoreGazebo?: boolean;
  
  /**
   * Whether to ignore transmission elements
   */
  ignoreTransmission?: boolean;
}
