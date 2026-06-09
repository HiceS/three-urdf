import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Quaternion, Vector3, Euler, Mesh, Object3D, Color } from 'three';
import { BoxGeometry, CylinderGeometry, SphereGeometry, CapsuleGeometry } from 'three';
import { parseURDF } from '../src/parser';
import { buildRobot } from '../src/builder';
import type { URDFJoint, URDFRobot } from '../src/builder';

function loadFixture(name: string): string {
    return readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
}

function loadKuka(): string {
    return readFileSync(resolve(__dirname, '../models/kuka_iiwa/iiwa14.urdf'), 'utf-8');
}

describe('buildRobot', () => {
    describe('basic structure', () => {
        it('creates correct joint and link maps for kuka', () => {
            const model = parseURDF(loadKuka(), {
                packageMap: { iiwa_description: '/models/kuka_iiwa/iiwa_description' },
            });
            const robot = buildRobot(model);

            expect(robot.name).toBe('iiwa14');
            expect(robot.joints.size).toBe(9);
            expect(robot.links.size).toBe(10);
        });

        it('creates correct maps for primitives fixture', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);

            expect(robot.name).toBe('primitives_robot');
            expect(robot.joints.size).toBe(3);
            expect(robot.links.size).toBe(4);
        });

        it('stores joint metadata correctly', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);

            const joint = robot.joints.get('base_to_cylinder')!;
            expect(joint).toBeDefined();
            expect(joint.jointType).toBe('revolute');
            expect(joint.jointName).toBe('base_to_cylinder');
            expect(joint.axis.z).toBeCloseTo(1);
            expect(joint.limits?.lower).toBeCloseTo(-1.57);
            expect(joint.limits?.upper).toBeCloseTo(1.57);
            expect(joint.jointValue).toBe(0);
        });
    });

    describe('coordinate conversion', () => {
        it('applies -90deg X rotation when convertToYUp is true', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { convertToYUp: true });

            expect(robot.rotation.x).toBeCloseTo(-Math.PI / 2);
        });

        it('does not rotate when convertToYUp is false', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { convertToYUp: false });

            expect(robot.rotation.x).toBeCloseTo(0);
        });
    });

    describe('setJointValue - revolute', () => {
        it('rotates joint by the specified angle around its axis', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);
            const joint = robot.joints.get('base_to_cylinder')!;

            const angle = Math.PI / 4;
            joint.setJointValue(angle);

            expect(joint.jointValue).toBeCloseTo(angle);

            // Expected: origin quaternion * axis-angle quaternion
            const originQuat = new Quaternion().setFromEuler(new Euler(0, 0, 0, 'ZYX'));
            const axisQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle);
            const expected = originQuat.multiply(axisQuat);

            expect(joint.quaternion.x).toBeCloseTo(expected.x);
            expect(joint.quaternion.y).toBeCloseTo(expected.y);
            expect(joint.quaternion.z).toBeCloseTo(expected.z);
            expect(joint.quaternion.w).toBeCloseTo(expected.w);
        });

        it('clamps value to joint limits', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);
            const joint = robot.joints.get('base_to_cylinder')!;

            // limits are -1.57 to 1.57
            joint.setJointValue(5.0);
            expect(joint.jointValue).toBeCloseTo(1.57);

            joint.setJointValue(-5.0);
            expect(joint.jointValue).toBeCloseTo(-1.57);
        });

        it('does not clamp continuous joints', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);
            const joint = robot.joints.get('sphere_to_capsule')!;

            expect(joint.jointType).toBe('continuous');
            joint.setJointValue(10.0);
            expect(joint.jointValue).toBeCloseTo(10.0);
        });
    });

    describe('setJointValue - prismatic', () => {
        it('translates joint along its axis', () => {
            const model = parseURDF(loadFixture('prismatic.urdf'));
            const robot = buildRobot(model);
            const joint = robot.joints.get('slide_joint')!;

            expect(joint.jointType).toBe('prismatic');

            joint.setJointValue(0.25);
            expect(joint.jointValue).toBeCloseTo(0.25);

            // origin is 0,0,0.05 and axis is 0,0,1
            // position should be 0, 0, 0.05 + 0.25 = 0.30
            expect(joint.position.x).toBeCloseTo(0);
            expect(joint.position.y).toBeCloseTo(0);
            expect(joint.position.z).toBeCloseTo(0.30);
        });

        it('clamps prismatic value to limits', () => {
            const model = parseURDF(loadFixture('prismatic.urdf'));
            const robot = buildRobot(model);
            const joint = robot.joints.get('slide_joint')!;

            // limits: 0 to 0.5
            joint.setJointValue(1.0);
            expect(joint.jointValue).toBeCloseTo(0.5);

            joint.setJointValue(-1.0);
            expect(joint.jointValue).toBeCloseTo(0);
        });
    });

    describe('setJointValues', () => {
        it('sets multiple joints at once', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);

            robot.setJointValues({
                base_to_cylinder: 0.5,
                sphere_to_capsule: 1.0,
            });

            expect(robot.joints.get('base_to_cylinder')!.jointValue).toBeCloseTo(0.5);
            expect(robot.joints.get('sphere_to_capsule')!.jointValue).toBeCloseTo(1.0);
        });

        it('ignores unknown joint names', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);

            expect(() => {
                robot.setJointValues({ nonexistent_joint: 1.0 });
            }).not.toThrow();
        });
    });

    describe('debug visualization', () => {
        it('buildRobot always adds debug spheres and lines', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model);

            const debugObjects: Object3D[] = [];
            robot.traverse((child) => {
                if (child.name.startsWith('debug_sphere_') || child.name.startsWith('debug_line_')) {
                    debugObjects.push(child);
                }
            });

            expect(debugObjects.length).toBeGreaterThan(0);

            const spheres = debugObjects.filter((o) => o.name.startsWith('debug_sphere_'));
            const lines = debugObjects.filter((o) => o.name.startsWith('debug_line_'));
            expect(spheres.length).toBe(4); // one per link
            expect(lines.length).toBe(3); // one per joint
        });
    });

    describe('primitive geometry rendering', () => {
        it('renders box geometry', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_base_link')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBe(1);
            expect(meshes[0].geometry).toBeInstanceOf(BoxGeometry);
        });

        it('renders cylinder geometry', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_cylinder_link')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBe(1);
            expect(meshes[0].geometry).toBeInstanceOf(CylinderGeometry);
        });

        it('renders sphere geometry', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_sphere_link')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBe(1);
            expect(meshes[0].geometry).toBeInstanceOf(SphereGeometry);
        });

        it('renders capsule geometry', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_capsule_link')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBe(1);
            expect(meshes[0].geometry).toBeInstanceOf(CapsuleGeometry);
        });

        it('applies inline material colors', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_cylinder_link')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBe(1);
            const mat = meshes[0].material as import('three').MeshStandardMaterial;
            // inline_blue has color rgba="0 0 1 1"
            expect(mat.color.r).toBeCloseTo(0);
            expect(mat.color.g).toBeCloseTo(0);
            expect(mat.color.b).toBeCloseTo(1);
        });

        it('applies transparency for alpha < 1', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_sphere_link')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBe(1);
            const mat = meshes[0].material as import('three').MeshStandardMaterial;
            expect(mat.transparent).toBe(true);
            expect(mat.opacity).toBeCloseTo(0.5);
        });

        it('uses default grey when no material is specified', () => {
            const model = parseURDF(loadFixture('prismatic.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const meshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('visual_')) {
                    meshes.push(child);
                }
            });

            expect(meshes.length).toBeGreaterThan(0);
            const mat = meshes[0].material as import('three').MeshStandardMaterial;
            const expected = new Color(0x888888);
            expect(mat.color.r).toBeCloseTo(expected.r);
            expect(mat.color.g).toBeCloseTo(expected.g);
            expect(mat.color.b).toBeCloseTo(expected.b);
        });
    });

    describe('collision visualization', () => {
        it('renders collision geometry when showCollision is true', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false, showCollision: true });

            const collisionMeshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('collision_')) {
                    collisionMeshes.push(child);
                }
            });

            expect(collisionMeshes.length).toBeGreaterThan(0);
            const mat = collisionMeshes[0].material as import('three').MeshStandardMaterial;
            expect(mat.transparent).toBe(true);
            expect(mat.wireframe).toBe(true);
        });

        it('omits collision geometry when showCollision is false', () => {
            const model = parseURDF(loadFixture('primitives.urdf'));
            const robot = buildRobot(model, { showDebug: false, showCollision: false });

            const collisionMeshes: Mesh[] = [];
            robot.traverse((child) => {
                if (child instanceof Mesh && child.name.startsWith('collision_')) {
                    collisionMeshes.push(child);
                }
            });

            expect(collisionMeshes.length).toBe(0);
        });
    });

    describe('mimic joints', () => {
        it('propagates source joint value to mimic follower', () => {
            const model = parseURDF(loadFixture('mimic.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const leftJoint = robot.joints.get('finger_left_joint')!;
            const rightJoint = robot.joints.get('finger_right_joint')!;

            expect(rightJoint.mimicSource).toBeDefined();
            expect(rightJoint.mimicSource?.jointName).toBe('finger_left_joint');
            expect(rightJoint.mimicSource?.multiplier).toBe(-1);
            expect(rightJoint.mimicSource?.offset).toBe(0);

            leftJoint.setJointValue(0.02);

            // mimic: multiplier=-1, offset=0 → right = -1 * 0.02 + 0 = -0.02
            expect(rightJoint.jointValue).toBeCloseTo(-0.02);
        });

        it('clamps mimic follower value to its own limits', () => {
            const model = parseURDF(loadFixture('mimic.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const leftJoint = robot.joints.get('finger_left_joint')!;
            const rightJoint = robot.joints.get('finger_right_joint')!;

            // left limit is 0 to 0.04, right limit is -0.04 to 0
            // Setting left to 0.04 → right should be -0.04 (within limits)
            leftJoint.setJointValue(0.04);
            expect(rightJoint.jointValue).toBeCloseTo(-0.04);
        });
    });

    describe('floating joint', () => {
        it('sets position and rotation from 6DOF array', () => {
            const model = parseURDF(loadFixture('floating-planar.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const joint = robot.joints.get('floating_joint')!;
            expect(joint.jointType).toBe('floating');

            joint.setJointValue([0.5, 0.3, 0.1, 0, 0, Math.PI / 4]);

            const val = joint.jointValue as number[];
            expect(val).toHaveLength(6);
            expect(val[0]).toBeCloseTo(0.5);

            // Position should be origin + offset
            expect(joint.position.x).toBeCloseTo(0.5);
            expect(joint.position.y).toBeCloseTo(0.3);
            expect(joint.position.z).toBeCloseTo(1.1); // origin z=1 + 0.1
        });
    });

    describe('planar joint', () => {
        it('translates in the plane perpendicular to axis', () => {
            const model = parseURDF(loadFixture('floating-planar.urdf'));
            const robot = buildRobot(model, { showDebug: false });

            const joint = robot.joints.get('planar_joint')!;
            expect(joint.jointType).toBe('planar');

            joint.setJointValue([0.1, 0.2]);

            const val = joint.jointValue as number[];
            expect(val).toHaveLength(2);

            // Axis is Z, so motion should be in XY plane
            // position.z should stay at the origin value (0.15)
            expect(joint.position.z).toBeCloseTo(0.15);
        });
    });

    describe('multi-format mesh paths', () => {
        it('preserves various mesh filename extensions after parsing', () => {
            const model = parseURDF(loadFixture('multi-format.urdf'), {
                packageMap: { robot_description: '/robots' },
                workingPath: '/assets',
            });

            const baseLink = model.links.get('base_link')!;
            expect(baseLink.visuals[0].geometry.type).toBe('mesh');
            if (baseLink.visuals[0].geometry.type === 'mesh') {
                expect(baseLink.visuals[0].geometry.filename).toBe('/robots/meshes/base.stl');
            }

            const daeLink = model.links.get('dae_link')!;
            if (daeLink.visuals[0].geometry.type === 'mesh') {
                expect(daeLink.visuals[0].geometry.filename).toBe('/robots/meshes/arm.dae');
            }

            const objLink = model.links.get('obj_link')!;
            if (objLink.visuals[0].geometry.type === 'mesh') {
                expect(objLink.visuals[0].geometry.filename).toBe('/robots/meshes/gripper.obj');
                expect(objLink.visuals[0].geometry.scale).toBeDefined();
            }

            const gltfLink = model.links.get('gltf_link')!;
            if (gltfLink.visuals[0].geometry.type === 'mesh') {
                expect(gltfLink.visuals[0].geometry.filename).toBe('/assets/meshes/tool.gltf');
            }

            const glbLink = model.links.get('glb_link')!;
            if (glbLink.visuals[0].geometry.type === 'mesh') {
                expect(glbLink.visuals[0].geometry.filename).toBe('/assets/meshes/tool.glb');
            }
        });
    });
});
