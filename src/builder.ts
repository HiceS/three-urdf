import {
    Object3D,
    Group,
    Mesh,
    SphereGeometry,
    BoxGeometry,
    CylinderGeometry,
    CapsuleGeometry,
    MeshBasicMaterial,
    MeshStandardMaterial,
    LineSegments,
    BufferGeometry,
    LineBasicMaterial,
    Vector3,
    Euler,
    Quaternion,
    Color,
    TextureLoader,
} from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { RobotModel, Joint, RPY, Visual, Material, Geometry } from './types';

export interface BuildRobotOptions {
    jointRadius?: number;
    jointColor?: number;
    linkColor?: number;
    convertToYUp?: boolean;
    showDebug?: boolean;
    showCollision?: boolean;
    collisionColor?: number;
    collisionOpacity?: number;
    onMeshError?: (filename: string, error: unknown) => void;
}

export interface URDFJoint extends Object3D {
    jointType: Joint['type'];
    axis: Vector3;
    jointName: string;
    limits?: { lower?: number; upper?: number };
    jointValue: number | number[];
    mimicSource?: { jointName: string; multiplier: number; offset: number };
    setJointValue: (value: number | number[]) => void;
}

export interface URDFRobot extends Group {
    joints: Map<string, URDFJoint>;
    links: Map<string, Object3D>;
    setJointValues: (values: Record<string, number | number[]>) => void;
}

function rpyToEuler(rpy: RPY): Euler {
    return new Euler(rpy.r, rpy.p, rpy.y, 'ZYX');
}

function createJointSphere(radius: number, color: number): Mesh {
    const geometry = new SphereGeometry(radius, 8, 8);
    const material = new MeshBasicMaterial({ color });
    return new Mesh(geometry, material);
}

function createLinkLine(target: Vector3, color: number): LineSegments {
    const geometry = new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        target.clone(),
    ]);
    const material = new LineBasicMaterial({ color });
    return new LineSegments(geometry, material);
}

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

    if (urdfMaterial?.texture) {
        const textureLoader = new TextureLoader();
        textureLoader.load(
            urdfMaterial.texture,
            (texture) => {
                mat.map = texture;
                mat.needsUpdate = true;
            },
            undefined,
            () => {
                // texture load failed, keep solid color
            }
        );
    }

    return mat;
}

function createPrimitiveGeometry(geometry: Geometry): BufferGeometry | null {
    switch (geometry.type) {
        case 'box':
            return new BoxGeometry(geometry.size.x, geometry.size.y, geometry.size.z);
        case 'cylinder': {
            return new CylinderGeometry(geometry.radius, geometry.radius, geometry.length, 32);
        }
        case 'sphere':
            return new SphereGeometry(geometry.radius, 32, 16);
        case 'capsule':
            return new CapsuleGeometry(geometry.radius, geometry.length, 16, 32);
        default:
            return null;
    }
}

function addPrimitiveVisuals(
    link: { visuals: Visual[] },
    linkGroup: Object3D,
    materials: Map<string, Material>,
    linkName: string
) {
    for (const visual of link.visuals) {
        if (visual.geometry.type === 'mesh') continue;

        const geom = createPrimitiveGeometry(visual.geometry);
        if (!geom) continue;

        const mat = getMaterial(visual, materials);
        const mesh = new Mesh(geom, mat);
        mesh.name = `visual_${linkName}_${visual.name || visual.geometry.type}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.position.copy(visual.origin.xyz);
        mesh.rotation.copy(rpyToEuler(visual.origin.rpy));

        // URDF cylinders/capsules are Z-aligned, Three.js are Y-aligned
        if (visual.geometry.type === 'cylinder' || visual.geometry.type === 'capsule') {
            mesh.rotateX(Math.PI / 2);
        }

        linkGroup.add(mesh);
    }
}

function addCollisionVisuals(
    link: { collisions: { origin: { xyz: Vector3; rpy: RPY }; geometry: Geometry; name?: string }[] },
    linkGroup: Object3D,
    linkName: string,
    collisionColor: number,
    collisionOpacity: number
) {
    for (const collision of link.collisions) {
        const geom = createPrimitiveGeometry(collision.geometry);
        if (!geom) continue;

        const mat = new MeshStandardMaterial({
            color: collisionColor,
            transparent: true,
            opacity: collisionOpacity,
            wireframe: true,
        });
        const mesh = new Mesh(geom, mat);
        mesh.name = `collision_${linkName}_${collision.name || collision.geometry.type}`;

        mesh.position.copy(collision.origin.xyz);
        mesh.rotation.copy(rpyToEuler(collision.origin.rpy));

        if (collision.geometry.type === 'cylinder' || collision.geometry.type === 'capsule') {
            mesh.rotateX(Math.PI / 2);
        }

        linkGroup.add(mesh);
    }
}

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
        showCollision = false,
        collisionColor = 0x00ffff,
        collisionOpacity = 0.3,
    } = options;

    const robot = new Group() as URDFRobot;
    robot.name = model.name;
    robot.joints = new Map();
    robot.links = new Map();

    if (convertToYUp) {
        robot.rotation.x = -Math.PI / 2;
    }

    robot.setJointValues = (values: Record<string, number | number[]>) => {
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

    // Track mimic relationships to wire up after all joints are built
    const mimicJoints: { joint: URDFJoint; sourceJointName: string; multiplier: number; offset: number }[] = [];

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

        addPrimitiveVisuals(link, linkGroup, model.materials, linkName);

        if (showCollision) {
            addCollisionVisuals(link, linkGroup, linkName, collisionColor, collisionOpacity);
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

            const originQuaternion = new Quaternion().setFromEuler(rpyToEuler(jointData.origin.rpy));
            jointObject.quaternion.copy(originQuaternion);

            if (showDebug) {
                const line = createLinkLine(jointData.origin.xyz, linkColor);
                line.name = `debug_line_${jointData.name}`;
                linkGroup.add(line);
            }

            const followers: { joint: URDFJoint; multiplier: number; offset: number }[] = [];

            jointObject.setJointValue = (value: number | number[]) => {
                const axis = jointObject.axis;

                switch (jointData.type) {
                    case 'revolute':
                    case 'continuous': {
                        let v = value as number;
                        if (jointData.limits) {
                            if (jointData.limits.lower !== undefined && v < jointData.limits.lower) {
                                v = jointData.limits.lower;
                            }
                            if (jointData.limits.upper !== undefined && v > jointData.limits.upper) {
                                v = jointData.limits.upper;
                            }
                        }
                        jointObject.jointValue = v;
                        const axisQuat = new Quaternion().setFromAxisAngle(axis, v);
                        jointObject.quaternion.copy(originQuaternion).multiply(axisQuat);
                        break;
                    }
                    case 'prismatic': {
                        let v = value as number;
                        if (jointData.limits) {
                            if (jointData.limits.lower !== undefined && v < jointData.limits.lower) {
                                v = jointData.limits.lower;
                            }
                            if (jointData.limits.upper !== undefined && v > jointData.limits.upper) {
                                v = jointData.limits.upper;
                            }
                        }
                        jointObject.jointValue = v;
                        jointObject.position.copy(jointData.origin.xyz);
                        jointObject.position.addScaledVector(axis, v);
                        break;
                    }
                    case 'floating': {
                        const arr = value as number[];
                        if (arr.length >= 6) {
                            jointObject.jointValue = arr;
                            jointObject.position.set(
                                jointData.origin.xyz.x + arr[0],
                                jointData.origin.xyz.y + arr[1],
                                jointData.origin.xyz.z + arr[2]
                            );
                            const floatEuler = new Euler(arr[3], arr[4], arr[5], 'ZYX');
                            const floatQuat = new Quaternion().setFromEuler(floatEuler);
                            jointObject.quaternion.copy(originQuaternion).multiply(floatQuat);
                        }
                        break;
                    }
                    case 'planar': {
                        const arr = value as number[];
                        if (arr.length >= 2) {
                            jointObject.jointValue = arr;
                            // Planar motion in the plane perpendicular to the axis
                            const normal = axis.clone().normalize();
                            const tangent1 = new Vector3();
                            const tangent2 = new Vector3();

                            if (Math.abs(normal.x) < 0.9) {
                                tangent1.crossVectors(normal, new Vector3(1, 0, 0)).normalize();
                            } else {
                                tangent1.crossVectors(normal, new Vector3(0, 1, 0)).normalize();
                            }
                            tangent2.crossVectors(normal, tangent1).normalize();

                            jointObject.position.copy(jointData.origin.xyz);
                            jointObject.position.addScaledVector(tangent1, arr[0]);
                            jointObject.position.addScaledVector(tangent2, arr[1]);
                        }
                        break;
                    }
                }

                for (const follower of followers) {
                    const sourceVal = typeof jointObject.jointValue === 'number' ? jointObject.jointValue : 0;
                    follower.joint.setJointValue(follower.multiplier * sourceVal + follower.offset);
                }
            };

            // Store followers array on the joint for mimic wiring
            (jointObject as URDFJoint & { _mimicFollowers: typeof followers })._mimicFollowers = followers;

            if (jointData.mimic) {
                jointObject.mimicSource = {
                    jointName: jointData.mimic.joint,
                    multiplier: jointData.mimic.multiplier ?? 1,
                    offset: jointData.mimic.offset ?? 0,
                };
                mimicJoints.push({
                    joint: jointObject,
                    sourceJointName: jointData.mimic.joint,
                    multiplier: jointData.mimic.multiplier ?? 1,
                    offset: jointData.mimic.offset ?? 0,
                });
            }

            linkGroup.add(jointObject);
            robot.joints.set(jointData.name, jointObject);

            buildLink(jointData.child, jointObject);
        }
    }

    if (model.rootLink) {
        buildLink(model.rootLink, robot);
    }

    // Wire up mimic joint followers
    for (const { joint, sourceJointName, multiplier, offset } of mimicJoints) {
        const sourceJoint = robot.joints.get(sourceJointName) as URDFJoint & { _mimicFollowers?: { joint: URDFJoint; multiplier: number; offset: number }[] };
        if (sourceJoint?._mimicFollowers) {
            sourceJoint._mimicFollowers.push({ joint, multiplier, offset });
        }
    }

    return robot;
}

export function buildRobot(model: RobotModel, options: BuildRobotOptions = {}): URDFRobot {
    return buildRobotStructure(model, { ...options, showDebug: true });
}

function loadMeshFile(
    filename: string,
    onSuccess: (obj: Object3D) => void,
    onError: (error: unknown) => void
): void {
    const ext = filename.split('.').pop()?.toLowerCase();

    const handleSceneResult = (scene: Object3D) => {
        onSuccess(scene);
    };

    const handleError = (error: unknown) => {
        onError(error);
    };

    switch (ext) {
        case 'dae': {
            const loader = new ColladaLoader();
            loader.load(filename, (result) => handleSceneResult(result.scene), undefined, handleError);
            break;
        }
        case 'obj': {
            const loader = new OBJLoader();
            loader.load(filename, (result) => onSuccess(result), undefined, handleError);
            break;
        }
        case 'gltf':
        case 'glb': {
            const loader = new GLTFLoader();
            loader.load(filename, (result) => handleSceneResult(result.scene), undefined, handleError);
            break;
        }
        default: {
            const loader = new STLLoader();
            loader.load(
                filename,
                (geometry) => {
                    // STL returns BufferGeometry, wrap in a Mesh (material applied by caller)
                    const mesh = new Mesh(geometry);
                    onSuccess(mesh);
                },
                undefined,
                handleError
            );
            break;
        }
    }
}

export async function loadRobot(
    model: RobotModel,
    options: BuildRobotOptions = {}
): Promise<URDFRobot> {
    const { showDebug = false, onMeshError, ...restOptions } = options;

    const robot = buildRobotStructure(model, { ...restOptions, showDebug });

    const loadPromises: Promise<void>[] = [];

    for (const [linkName, link] of model.links) {
        const linkGroup = robot.links.get(linkName);
        if (!linkGroup) continue;

        for (const visual of link.visuals) {
            if (visual.geometry.type !== 'mesh') continue;

            const meshFilename = visual.geometry.filename;
            if (!meshFilename) continue;

            const visualGeometry = visual.geometry;

            const loadPromise = new Promise<void>((resolve) => {
                loadMeshFile(
                    meshFilename,
                    (obj) => {
                        const mat = getMaterial(visual, model.materials);

                        if (obj instanceof Mesh) {
                            obj.material = mat;
                        } else {
                            obj.traverse((child) => {
                                if (child instanceof Mesh) {
                                    child.material = mat;
                                }
                            });
                        }

                        obj.name = `visual_${linkName}_${visual.name || 'mesh'}`;
                        obj.castShadow = true;
                        obj.receiveShadow = true;

                        obj.position.copy(visual.origin.xyz);
                        obj.rotation.copy(rpyToEuler(visual.origin.rpy));

                        if (visualGeometry.type === 'mesh' && visualGeometry.scale) {
                            obj.scale.copy(visualGeometry.scale);
                        }

                        linkGroup.add(obj);
                        resolve();
                    },
                    (error) => {
                        if (onMeshError) {
                            onMeshError(meshFilename, error);
                        } else {
                            console.warn(`Failed to load mesh ${meshFilename}:`, error);
                        }
                        resolve();
                    }
                );
            });

            loadPromises.push(loadPromise);
        }
    }

    await Promise.all(loadPromises);

    return robot;
}
