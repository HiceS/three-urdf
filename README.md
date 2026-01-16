# three-urdf

A lightweight TypeScript library for parsing URDF files and rendering interactive Three.js robot models.

## Features

- Parse URDF XML into strongly-typed TypeScript objects
- Build Three.js Object3D hierarchies with proper kinematic chains
- Load STL meshes with correct transforms and materials
- Control joint angles programmatically
- Automatic Z-up to Y-up coordinate conversion
- Debug visualization mode (spheres and lines)

## Installation

```bash
npm install three-urdf three
```

`three` is a peer dependency - you need to install it separately.

## Quick Start

### Basic Usage

```typescript
import { parseURDF, loadRobot } from 'three-urdf';

// fetch and parse the URDF
const response = await fetch('/models/robot.urdf');
const urdfText = await response.text();

const robotModel = parseURDF(urdfText, {
  packageMap: {
    // map ROS package names to actual paths
    'my_robot_description': '/models/my_robot',
  },
});

// build the Three.js object with meshes
const robot = await loadRobot(robotModel);

// add to your scene
scene.add(robot);
```

### Controlling Joints

```typescript
// set individual joint
const joint = robot.joints.get('shoulder_pan_joint');
joint?.setJointValue(Math.PI / 4); // radians

// set multiple joints at once
robot.setJointValues({
  shoulder_pan_joint: 0.5,
  shoulder_lift_joint: -0.3,
  elbow_joint: 1.2,
});
```

### Debug Visualization

Use `buildRobot` for a lightweight debug view without loading meshes:

```typescript
import { parseURDF, buildRobot } from 'three-urdf';

const robotModel = parseURDF(urdfText);
const robot = buildRobot(robotModel, {
  jointRadius: 0.03,    // size of joint spheres
  jointColor: 0xff0000, // red
  linkColor: 0x00ff00,  // green lines
});
```

## React Three Fiber Example

```tsx
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { parseURDF, loadRobot } from 'three-urdf';
import type { URDFRobot } from 'three-urdf';

function Robot() {
  const [robot, setRobot] = useState<URDFRobot | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch('/models/robot.urdf');
      const urdf = await res.text();
      const model = parseURDF(urdf, {
        packageMap: { robot_description: '/models' },
      });
      const obj = await loadRobot(model);
      setRobot(obj);
    }
    load();
  }, []);

  if (!robot) return null;
  return <primitive object={robot} />;
}

export default function App() {
  return (
    <Canvas camera={{ position: [2, 2, 2] }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} />
      <Robot />
      <OrbitControls />
    </Canvas>
  );
}
```

## API Reference

### `parseURDF(urdfString, options?)`

Parse a URDF XML string into a `RobotModel` object.

**Options:**
- `packageMap?: Record<string, string>` - Map ROS package names to URL paths

**Returns:** `RobotModel` with links, joints, and materials

### `buildRobot(model, options?)`

Build a Three.js Object3D hierarchy with debug visualization (no mesh loading).

**Options:**
- `jointRadius?: number` - Radius of joint spheres (default: 0.02)
- `jointColor?: number` - Color of joint spheres (default: 0xff0000)
- `linkColor?: number` - Color of link lines (default: 0x00ff00)
- `convertToYUp?: boolean` - Convert Z-up to Y-up (default: true)
- `showDebug?: boolean` - Show debug visualization (default: true)

**Returns:** `URDFRobot`

### `loadRobot(model, options?)`

Build a Three.js Object3D hierarchy and load STL meshes.

**Options:** Same as `buildRobot`, plus:
- `showDebug?: boolean` - Show debug visualization (default: false)

**Returns:** `Promise<URDFRobot>`

### `URDFRobot`

The root robot object extending `THREE.Group`:

```typescript
interface URDFRobot extends Group {
  joints: Map<string, URDFJoint>;
  links: Map<string, Object3D>;
  setJointValues: (values: Record<string, number>) => void;
}
```

### `URDFJoint`

Joint object extending `THREE.Object3D`:

```typescript
interface URDFJoint extends Object3D {
  jointType: 'revolute' | 'continuous' | 'prismatic' | 'fixed' | 'floating' | 'planar';
  axis: Vector3;
  jointName: string;
  limits?: { lower?: number; upper?: number };
  jointValue: number;
  setJointValue: (value: number) => void;
}
```

## Coordinate Systems

URDF uses Z-up coordinates while Three.js uses Y-up. By default, `loadRobot` and `buildRobot` apply a -90° rotation around X to convert coordinates. Disable with `convertToYUp: false`.

## URDF Euler Angles

URDF specifies rotations as RPY (roll-pitch-yaw) using **extrinsic XYZ** order ("fixed axis"). This is equivalent to **intrinsic ZYX** in Three.js Euler angles.

## Supported URDF Features

- Links with visual and collision geometry
- Joints: revolute, continuous, prismatic, fixed
- Joint limits (upper/lower bounds)
- Materials with colors
- STL mesh loading
- Package path resolution

## Development

```bash
# install dependencies
npm install

# run tests
npm test

# build library
npm run build

# run demo
cd demo && npm install && npm run dev
```

## License

MIT
