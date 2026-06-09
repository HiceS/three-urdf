# three-urdf   [![packages/three-urdf](https://img.shields.io/badge/packages%2Fthree--urdf-npm-CB3837?style=flat&logo=npm)](https://www.npmjs.com/package/three-urdf)


Parse URDF files and build interactive Three.js robot models with joint controls.

<img width="740" height="471" alt="Kuka Robot Example" src="https://github.com/user-attachments/assets/4d6e74d7-e9c5-49b9-ad8f-29c6594e5561" />

## Install

```bash
npm install three-urdf three
```

`three` is a peer dependency — you provide it, we don't bundle it.

## Quick Start

```typescript
import { parseURDF, loadRobot } from 'three-urdf';

const response = await fetch('/models/robot.urdf');
const urdfText = await response.text();

const model = parseURDF(urdfText, {
  packageMap: {
    'my_robot_description': '/models/my_robot',
  },
});

const robot = await loadRobot(model);
scene.add(robot);
```

## Controlling Joints

```typescript
// Single joint (radians for revolute, meters for prismatic)
const joint = robot.joints.get('shoulder_pan_joint');
joint?.setJointValue(Math.PI / 4);

// Multiple joints at once
robot.setJointValues({
  shoulder_pan_joint: 0.5,
  shoulder_lift_joint: -0.3,
  elbow_joint: 1.2,
});
```

Joint values are automatically clamped to URDF-defined limits. Mimic joints propagate automatically — when you move a source joint, its followers update.

## Mesh Formats

The library picks the right Three.js loader based on file extension:

| Extension | Loader | Notes |
|-----------|--------|-------|
| `.stl` | STLLoader | Default if extension is unknown |
| `.dae` | ColladaLoader | Common in ROS packages |
| `.obj` | OBJLoader | |
| `.gltf` / `.glb` | GLTFLoader | |

## Primitive Geometry

URDFs that use `<box>`, `<cylinder>`, `<sphere>`, or `<capsule>` for visuals render without any mesh files. This means you can test URDF structures without shipping STL/DAE assets.

## Debug Visualization

`buildRobot` gives you a lightweight wireframe view — spheres at joints, lines between them — without loading any meshes:

```typescript
import { parseURDF, buildRobot } from 'three-urdf';

const model = parseURDF(urdfText);
const robot = buildRobot(model, {
  jointRadius: 0.03,
  jointColor: 0xff0000,
  linkColor: 0x00ff00,
});
```

## React Three Fiber

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
      setRobot(await loadRobot(model));
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

## API

### `parseURDF(urdfString, options?)`

Parses a URDF XML string into a `RobotModel`.

| Option | Type | Description |
|--------|------|-------------|
| `packageMap` | `Record<string, string>` | Maps ROS package names to URL paths. `package://foo/bar.stl` becomes `${packageMap['foo']}/bar.stl` |
| `workingPath` | `string` | Base path prepended to relative mesh filenames |

Returns a `RobotModel` containing Maps of links, joints, and materials.

### `loadRobot(model, options?)`

Builds a Three.js scene graph and loads all mesh files. Returns `Promise<URDFRobot>`.

### `buildRobot(model, options?)`

Same as `loadRobot` but synchronous, debug-only — no mesh loading, just joint spheres and link lines. Returns `URDFRobot`.

### Build Options

Both `loadRobot` and `buildRobot` accept:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `convertToYUp` | `boolean` | `true` | Rotate root -90deg around X (URDF is Z-up, Three.js is Y-up) |
| `showDebug` | `boolean` | `false` / `true` | Debug spheres and lines. Always on for `buildRobot`, off for `loadRobot` |
| `showCollision` | `boolean` | `false` | Render collision geometry as transparent wireframe overlays |
| `collisionColor` | `number` | `0x00ffff` | Color for collision wireframes |
| `collisionOpacity` | `number` | `0.3` | Opacity for collision wireframes |
| `jointRadius` | `number` | `0.02` | Debug sphere radius |
| `jointColor` | `number` | `0xff0000` | Debug sphere color |
| `linkColor` | `number` | `0x00ff00` | Debug line color |
| `onMeshError` | `(filename, error) => void` | `console.warn` | Called when a mesh file fails to load |

### `URDFRobot`

Extends `THREE.Group`:

```typescript
robot.joints    // Map<string, URDFJoint>
robot.links     // Map<string, Object3D>
robot.setJointValues({ joint_name: value })
```

### `URDFJoint`

Extends `THREE.Object3D`:

```typescript
joint.jointType    // 'revolute' | 'continuous' | 'prismatic' | 'fixed' | 'floating' | 'planar'
joint.jointName    // string
joint.axis         // Vector3
joint.limits       // { lower?: number; upper?: number } | undefined
joint.jointValue   // number | number[]
joint.setJointValue(value)  // number for revolute/prismatic, number[] for floating (6DOF) / planar (2DOF)
```

## Joint Types

| Type | `setJointValue` input | Behavior |
|------|----------------------|----------|
| `revolute` | `number` (radians) | Rotates around axis, clamped to limits |
| `continuous` | `number` (radians) | Same as revolute, no limits |
| `prismatic` | `number` (meters) | Translates along axis, clamped to limits |
| `fixed` | — | No motion |
| `floating` | `[x, y, z, roll, pitch, yaw]` | Full 6DOF positioning |
| `planar` | `[x, y]` | Translation in the plane perpendicular to axis |

## Coordinate Systems

URDF uses Z-up. Three.js uses Y-up. By default the root gets a -90deg X rotation to convert. Pass `convertToYUp: false` to skip this.

URDF rotations (RPY) use extrinsic XYZ order, which maps to Three.js Euler order `'ZYX'`. This is handled internally — you don't need to think about it unless you're reading the source.

## Limitations

- **Xacro**: Not supported. Run `xacro` to expand macros into plain URDF first.
- **Gazebo/transmission tags**: Silently ignored. These are ROS-specific and not needed for visualization.
- **Physics**: Joint dynamics (damping, friction) and safety controllers are parsed and available on the model but not applied to any physics simulation.
- **Textures**: Parsed and loaded via `TextureLoader`, but many URDF files don't use them.
- **Sensors**: Not parsed.

## Development

```bash
npm install
npm test
npm run build
npm run lint
```

## License

MIT
