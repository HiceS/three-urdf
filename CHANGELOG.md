# Changelog

## 0.2.0

### Multi-format mesh loading

The library now supports DAE/COLLADA, OBJ, and GLTF/GLB meshes in addition to STL. The correct Three.js loader is selected automatically based on file extension. Previously, non-STL meshes would silently fail to load.

### Primitive geometry rendering

URDFs that use `<box>`, `<cylinder>`, `<sphere>`, or `<capsule>` for visual geometry now render as proper Three.js meshes. Previously these were silently skipped — only `<mesh>` elements produced visible output.

### Mimic joint propagation

Joints with `<mimic>` elements now automatically follow their source joint. When you call `setJointValue` on the source, all mimic followers update with the configured multiplier and offset. Common in gripper robots.

### Floating and planar joint support

`floating` joints accept a 6-element array `[x, y, z, roll, pitch, yaw]` and `planar` joints accept a 2-element array `[x, y]` via `setJointValue`. Previously these joint types were parsed but silently ignored.

### Collision geometry visualization

New `showCollision` option renders collision geometry as transparent wireframe overlays. Useful for debugging collision bounds alongside visual meshes.

### Texture loading

Materials with `<texture>` elements now load the referenced texture file and apply it to the mesh material. Previously textures were parsed but never applied.

### Inline material definitions

Visual elements with inline `<material><color .../></material>` definitions now use the specified color. Previously only top-level material references worked — inline definitions fell back to grey.

### Mesh error callback

New `onMeshError` option lets you handle mesh load failures instead of relying on `console.warn`.

### Build fix

Fixed Rollup external configuration to properly externalize Three.js subpath imports (`three/examples/jsm/loaders/*`). Previously these could be incorrectly bundled into the library output.

### Removed unused options

Removed `ignoreGazebo` and `ignoreTransmission` from `ParseURDFOptions`. These were defined but never implemented — the parser already ignores unknown elements.

### Tests

Added builder test suite (27 tests) covering joint articulation, primitive geometry rendering, collision visualization, mimic joints, floating/planar joints, coordinate conversion, and material handling. Added parser edge-case tests. Total test count: 50.

## 0.1.1

Initial release with URDF parsing and STL mesh loading.
