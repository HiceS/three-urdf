# three-urdf Development Guide

## Project Intention

This library is designed to parse URDF (Unified Robot Description Format) files and convert them into structured TypeScript data models that can be used to build Three.js 3D robot visualizations. The primary use case is loading and working with the Kuka IIWA 14 robot model (`models/kuka_iiwa/iiwa14.urdf`) in web applications built with Vite, React, and TypeScript.

### Core Purpose
- Parse URDF XML files into strongly-typed TypeScript objects
- Provide a clean API for accessing robot structure (links, joints, materials, geometry)
- Support web-based robot visualization and control interfaces
- Build Three.js Object3D hierarchies from parsed URDF data
- Load and display STL meshes with correct transforms

### Target Deployment
- **Environment**: Modern web browsers
- **Build Tool**: Vite
- **Framework**: React (consuming library)
- **Language**: TypeScript
- **3D Library**: Three.js (peer dependency)

## File Structure

```
three-urdf/
├── src/
│   ├── index.ts          # Public API exports (types + parser + builder)
│   ├── parser.ts         # Core URDF XML parsing logic
│   ├── builder.ts        # Three.js Object3D construction from RobotModel
│   └── types.ts          # TypeScript type definitions for URDF elements
├── demo/
│   └── src/
│       ├── App.tsx           # React three fiber demo app
│       └── RobotViewer.tsx   # Robot loading and display component
├── tests/
│   └── parser.test.ts    # Test suite using iiwa14.urdf as test data
├── models/
│   └── kuka_iiwa/
│       ├── iiwa14.urdf   # Primary test/example URDF file
│       └── iiwa_description/  # Mesh files referenced by URDF
├── package.json          # npm package config (ESM + CJS dual build)
├── rollup.config.js      # Build configuration
├── tsconfig.json         # TypeScript configuration
├── vitetest.config.ts    # Test runner configuration
└── README.md             # User-facing documentation
```

## Key Implementation Details

### Parser Architecture (`src/parser.ts`)

The parser uses `fast-xml-parser` for cross-platform XML parsing (works in both Node.js and browser). The parsing flow:

1. **XML Parsing**: Converts URDF string to structured object using fast-xml-parser
2. **Element Extraction**: Helper functions (`getChild`, `getChildren`, `getAttribute`) navigate parsed XML
3. **Type Conversion**: Parses URDF elements into TypeScript types:
   - Materials (colors, textures)
   - Links (inertial properties, visuals, collisions)
   - Joints (limits, dynamics, safety controllers, mimic joints)
4. **Root Link Detection**: Automatically identifies the root link (link with no parent joint)

### Builder Architecture (`src/builder.ts`)

The builder converts a `RobotModel` into a Three.js `Object3D` hierarchy:

1. **`buildRobot(model, options)`**: Synchronous function that creates debug visualization (spheres at joints, lines between them)
2. **`loadRobot(model, options)`**: Async function that loads actual STL meshes and builds the full robot

#### Critical: Euler Angle Conversion

**URDF uses "fixed axis" (extrinsic) XYZ rotations for RPY values.** This is equivalent to intrinsic ZYX rotations in Three.js.

```typescript
// WRONG - this will cause incorrect joint positions
function rpyToEuler(rpy: RPY): Euler {
  return new Euler(rpy.r, rpy.p, rpy.y, 'XYZ');  // incorrect!
}

// CORRECT - URDF extrinsic XYZ = Three.js intrinsic ZYX
function rpyToEuler(rpy: RPY): Euler {
  return new Euler(rpy.r, rpy.p, rpy.y, 'ZYX');
}
```

This is one of the most common bugs when porting URDF to Three.js. Symptoms of wrong Euler order:
- Joint positions jump around non-monotonically
- Robot segments overlap or point in wrong directions
- First joint (usually no rotation in origin) works, but others break

#### Z-up to Y-up Conversion

URDF uses Z-up coordinate system, Three.js uses Y-up. The builder applies a -90° rotation around X to the root:

```typescript
if (convertToYUp) {
  robot.rotation.x = -Math.PI / 2;
}
```

#### Kinematic Hierarchy

The Three.js hierarchy mirrors the URDF kinematic chain:
```
URDFRobot (Group)
  └── linkGroup_root
        └── jointObject_1 (positioned at joint origin)
              └── linkGroup_child_1
                    └── mesh_visual
                    └── jointObject_2
                          └── linkGroup_child_2
                                └── ...
```

### Type System (`src/types.ts`)

The library uses TypeScript interfaces to represent URDF elements:
- `RobotModel`: Top-level container with Maps for materials, links, and joints
- `Link`: Contains visuals, collisions, inertial properties, optional self-collision geometry
- `Joint`: Supports revolute, prismatic, fixed, continuous, floating, planar types
- `Geometry`: Union type for box, cylinder, sphere, mesh, capsule
- `Pose`: Uses Three.js `Vector3` for xyz, custom `RPY` type for roll-pitch-yaw

### Package Resolution

The parser handles two path resolution strategies:
1. **package:// URIs**: ROS-style package references (e.g., `package://iiwa_description/meshes/...`)
   - Resolved via `packageMap` option: `{ 'iiwa_description': '/actual/path' }`
   - If no mapping provided, URI is preserved for later resolution
2. **Relative paths**: Resolved against `workingPath` option

### Current State

**Implemented:**
- Full URDF parsing (materials, links, joints, geometry types)
- Joint limits, dynamics, safety controllers
- Mimic joints
- Self-collision checking geometry (non-standard extension)
- Package URI and relative path resolution
- Comprehensive test suite using iiwa14.urdf
- Three.js scene building with `buildRobot()` and `loadRobot()`
- STL mesh loading with correct transforms
- Joint articulation via `setJointValue()` method
- Coordinate system conversion (Z-up to Y-up)

**Not Yet Implemented:**
- Collision geometry visualization
- DAE/OBJ mesh formats (only STL currently)
- Joint mimic relationships at runtime
- Continuous joint wraparound

## Development Context

### Build System

- **Rollup**: Bundles library as both ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs`)
- **TypeScript**: Generates type declarations (`dist/index.d.ts`)
- **Dual Package**: Supports both `import` and `require()` usage

### Testing

- **Vitest**: Test runner (works in Node.js and browser)
- **Test Data**: Uses `models/kuka_iiwa/iiwa14.urdf` as primary test fixture
- **Coverage**: Tests cover parsing of all major URDF elements present in iiwa14.urdf

### Demo Application

Located in `demo/`, uses:
- React Three Fiber for declarative Three.js
- Leva for joint control sliders
- Vite for development server

Run with:
```bash
cd demo && npm run dev
```

### Dependencies

- **Peer**: `three` (^0.182.0) - not bundled, consumer provides
- **Runtime**: `fast-xml-parser` (^4.3.6) - XML parsing
- **Dev**: TypeScript, Rollup, Vitest, ESLint, Prettier

## iiwa14.urdf Specifics

The iiwa14.urdf file contains:
- **10 links**: world, iiwa_link_0 through iiwa_link_7, iiwa_link_ee
- **9 joints**: world_iiwa_joint (fixed), iiwa_joint_1-7 (revolute), iiwa_joint_ee (fixed)
- **8 materials**: Black, Blue, Green, Grey, Orange, Brown, Red, White
- **Mesh references**: All links use STL meshes from `package://iiwa_description/meshes/iiwa14/`
- **Joint properties**: All revolute joints have limits, safety controllers, and dynamics
- **Non-standard**: `self_collision_checking` element on link_0 (capsule geometry)

The parser successfully handles all these features, including the non-standard self-collision checking extension.

## Design Decisions

1. **Maps over Arrays**: Uses `Map<string, Material|Link|Joint>` for O(1) lookups by name
2. **Three.js Integration**: Uses `Vector3` from Three.js in types (creates dependency but enables direct usage)
3. **RPY vs Euler**: Keeps separate RPY type (URDF convention), converts to Euler with 'ZYX' order
4. **Optional Features**: Many URDF elements are optional (inertial, collision, etc.) - reflected in types
5. **Error Handling**: Throws descriptive errors for missing required attributes/elements
6. **Cross-Platform**: fast-xml-parser chosen for Node.js + browser compatibility
7. **Quaternion Composition**: Joint rotations composed using quaternion multiplication for numerical stability

## Common Pitfalls

### 1. Wrong Euler Order
URDF RPY is extrinsic XYZ = Three.js intrinsic ZYX. Using 'XYZ' causes broken kinematics.

### 2. Forgetting Coordinate Conversion
URDF is Z-up, Three.js is Y-up. Either rotate the whole robot or convert each transform.

### 3. Joint Rotation Composition
When setting joint values, compose the origin rotation with the axis rotation using quaternions:
```typescript
const originQuat = new Quaternion().setFromEuler(rpyToEuler(origin.rpy));
const axisQuat = new Quaternion().setFromAxisAngle(axis, value);
joint.quaternion.copy(originQuat).multiply(axisQuat);
```

### 4. Mesh Scale
Some URDF meshes have scale transforms. Always check `visual.geometry.scale` and apply to the mesh.

### 5. Multiple Three.js Instances
When using with bundlers, ensure only one Three.js instance is loaded to avoid "Multiple instances" warnings.
