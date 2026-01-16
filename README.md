# URDF-to-Three.js Library

**A lightweight, modern TypeScript library for parsing URDF files and generating interactive Three.js 3D robot models.**

## What is this?

This library makes it easy to take a **URDF** (Unified Robot Description Format) file — the standard XML-based robot description format used in ROS and robotics research — and turn it into a fully usable **Three.js** object hierarchy.

Once loaded, you get:
- A scene-ready group of links and joints
- Proper kinematic hierarchy (parent-child relationships)
- Support for moving joints programmatically (revolute, prismatic, fixed, etc.)
- Visuals & collision geometry where available (meshes, colors, materials)
- Joint limits, mimic joints, and other common URDF features (planned / partial)

The library is designed to be consumed in modern web projects — especially **React + Vite + TypeScript** applications — while staying flexible with Three.js versions.

## Goals & Philosophy

- **Minimal dependencies** — only `three` as a peer dependency (loose version range)
- **TypeScript-first** — excellent types & autocompletion for robot models, joints, links
- **Performant & tree-shakeable** — suitable for real-time robot visualization and control UIs
- **No forced renderer** — works with any Three.js scene (WebGLRenderer, CSS3DRenderer, etc.)
- **Future-friendly** — easy to extend for ROS integration, XR, animations, inverse kinematics, etc.
- **Developer-friendly publishing** — ESM + CJS + declarations, ready for npm

## Target Use Cases

- Web-based robot teleoperation interfaces
- Interactive robot model viewers in documentation / education
- Digital twins and simulation previews in the browser
- ROS web tools (combined with rosbridge / roslibjs)
- Three.js-based robotics demos and prototypes
- Visual debugging of robot configurations and joint states

## High-Level API Vision (conceptual)

```ts
import { parseURDF, buildThreeModel, createJointController } from 'urdf-three';

// 1. Parse raw URDF string or file content
const robotModel = parseURDF(urdfString, { packageMap });

// 2. Build Three.js hierarchy
const robotGroup = buildThreeModel(robotModel, {
  loadMesh: customMeshLoader,       // optional override
  workingPath: '/models/',          // for resolving mesh paths
});

// 3. Add to your scene
scene.add(robotGroup);

// 4. Control joints (simple API example)
const controller = createJointController(robotGroup);
controller.setJointValue('shoulder_pan_joint', 1.57);    // radians
controller.setJointValues({ elbow_joint: 0.8, wrist_1_joint: -1.2 });

// Or animate smoothly
controller.animateTo({ shoulder_lift_joint: Math.PI / 2 }, { duration: 1200 });
```

Ideally we would want to import the URDF as well as the associated meshes. The meshes are generally OBJ or STL files. But for now we are just parsing the URDF.