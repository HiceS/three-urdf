import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseURDF } from '../src/parser';

describe('URDF Parser', () => {
  const urdfPath = join(__dirname, '../models/kuka_iiwa/iiwa14.urdf');
  const urdfString = readFileSync(urdfPath, 'utf-8');

  it('should parse the iiwa14.urdf file without errors', () => {
    expect(() => parseURDF(urdfString)).not.toThrow();
  });

  it('should extract robot name correctly', () => {
    const model = parseURDF(urdfString);
    expect(model.name).toBe('iiwa14');
  });

  it('should parse all materials', () => {
    const model = parseURDF(urdfString);
    
    // Should have at least the materials defined in the URDF
    expect(model.materials.size).toBeGreaterThanOrEqual(8);
    
    // Check specific materials
    expect(model.materials.has('Grey')).toBe(true);
    expect(model.materials.has('Orange')).toBe(true);
    expect(model.materials.has('Black')).toBe(true);
    
    // Check material properties
    const greyMaterial = model.materials.get('Grey');
    expect(greyMaterial).toBeDefined();
    expect(greyMaterial?.color).toBeDefined();
    expect(greyMaterial?.color?.r).toBe(0.4);
    expect(greyMaterial?.color?.g).toBe(0.4);
    expect(greyMaterial?.color?.b).toBe(0.4);
    expect(greyMaterial?.color?.a).toBe(1.0);
  });

  it('should parse all links', () => {
    const model = parseURDF(urdfString);
    
    // Should have world link + 8 iiwa links + ee link = 10 links
    expect(model.links.size).toBeGreaterThanOrEqual(10);
    
    // Check specific links exist
    expect(model.links.has('world')).toBe(true);
    expect(model.links.has('iiwa_link_0')).toBe(true);
    expect(model.links.has('iiwa_link_7')).toBe(true);
    expect(model.links.has('iiwa_link_ee')).toBe(true);
  });

  it('should parse link properties correctly', () => {
    const model = parseURDF(urdfString);
    const link0 = model.links.get('iiwa_link_0');
    
    expect(link0).toBeDefined();
    expect(link0?.name).toBe('iiwa_link_0');
    
    // Check inertial properties
    expect(link0?.inertial).toBeDefined();
    expect(link0?.inertial?.mass).toBe(5);
    expect(link0?.inertial?.origin.xyz.x).toBe(-0.1);
    expect(link0?.inertial?.origin.xyz.y).toBe(0);
    expect(link0?.inertial?.origin.xyz.z).toBe(0.07);
    
    // Check visual elements
    expect(link0?.visuals.length).toBeGreaterThan(0);
    const visual = link0?.visuals[0];
    expect(visual?.geometry.type).toBe('mesh');
    if (visual?.geometry.type === 'mesh') {
      expect(visual.geometry.filename).toContain('iiwa_description');
    }
    
    // Check collision elements
    expect(link0?.collisions.length).toBeGreaterThan(0);
    
    // Check self-collision checking (non-standard extension)
    expect(link0?.selfCollision).toBeDefined();
    if (link0?.selfCollision) {
      expect(link0.selfCollision.geometry.type).toBe('capsule');
    }
  });

  it('should parse all joints', () => {
    const model = parseURDF(urdfString);
    
    // Should have world_iiwa_joint + 7 revolute joints + 1 fixed ee joint = 9 joints
    expect(model.joints.size).toBeGreaterThanOrEqual(9);
    
    // Check specific joints exist
    expect(model.joints.has('world_iiwa_joint')).toBe(true);
    expect(model.joints.has('iiwa_joint_1')).toBe(true);
    expect(model.joints.has('iiwa_joint_7')).toBe(true);
    expect(model.joints.has('iiwa_joint_ee')).toBe(true);
  });

  it('should parse joint properties correctly', () => {
    const model = parseURDF(urdfString);
    const joint1 = model.joints.get('iiwa_joint_1');
    
    expect(joint1).toBeDefined();
    expect(joint1?.name).toBe('iiwa_joint_1');
    expect(joint1?.type).toBe('revolute');
    expect(joint1?.parent).toBe('iiwa_link_0');
    expect(joint1?.child).toBe('iiwa_link_1');
    
    // Check origin
    expect(joint1?.origin.xyz.z).toBe(0.1575);
    
    // Check axis
    expect(joint1?.axis).toBeDefined();
    expect(joint1?.axis?.xyz.z).toBe(1);
    
    // Check limits
    expect(joint1?.limits).toBeDefined();
    expect(joint1?.limits?.lower).toBeCloseTo(-2.96705972839);
    expect(joint1?.limits?.upper).toBeCloseTo(2.96705972839);
    expect(joint1?.limits?.effort).toBe(300);
    expect(joint1?.limits?.velocity).toBe(10);
    
    // Check safety controller
    expect(joint1?.safetyController).toBeDefined();
    expect(joint1?.safetyController?.kPosition).toBe(100);
    expect(joint1?.safetyController?.kVelocity).toBe(2);
    
    // Check dynamics
    expect(joint1?.dynamics).toBeDefined();
    expect(joint1?.dynamics?.damping).toBe(0.5);
  });

  it('should identify root link correctly', () => {
    const model = parseURDF(urdfString);
    
    // The root link should be 'world' since it has no parent joint
    expect(model.rootLink).toBe('world');
  });

  it('should handle package:// URI resolution with packageMap', () => {
    const model = parseURDF(urdfString, {
      packageMap: {
        'iiwa_description': '/custom/path/to/iiwa_description',
      },
    });
    
    const link0 = model.links.get('iiwa_link_0');
    const visual = link0?.visuals[0];
    
    if (visual?.geometry.type === 'mesh') {
      expect(visual.geometry.filename).toContain('/custom/path/to/iiwa_description');
      expect(visual.geometry.filename).not.toContain('package://');
    }
  });

  it('should preserve package:// URIs when no packageMap provided', () => {
    const model = parseURDF(urdfString);
    
    const link0 = model.links.get('iiwa_link_0');
    const visual = link0?.visuals[0];
    
    if (visual?.geometry.type === 'mesh') {
      expect(visual.geometry.filename).toContain('package://');
    }
  });

  it('should handle relative paths with workingPath', () => {
    const urdfWithRelativePath = `<?xml version="1.0"?>
<robot name="test">
  <link name="link1">
    <visual>
      <geometry>
        <mesh filename="meshes/link1.stl"/>
      </geometry>
    </visual>
  </link>
</robot>`;
    
    const model = parseURDF(urdfWithRelativePath, {
      workingPath: '/base/path',
    });
    
    const link1 = model.links.get('link1');
    const visual = link1?.visuals[0];
    
    if (visual?.geometry.type === 'mesh') {
      expect(visual.geometry.filename).toBe('/base/path/meshes/link1.stl');
    }
  });

  it('should parse fixed joints correctly', () => {
    const model = parseURDF(urdfString);
    const fixedJoint = model.joints.get('world_iiwa_joint');
    
    expect(fixedJoint).toBeDefined();
    expect(fixedJoint?.type).toBe('fixed');
    expect(fixedJoint?.parent).toBe('world');
    expect(fixedJoint?.child).toBe('iiwa_link_0');
  });

  it('should parse all revolute joints with correct properties', () => {
    const model = parseURDF(urdfString);
    
    // Check all 7 revolute joints
    for (let i = 1; i <= 7; i++) {
      const joint = model.joints.get(`iiwa_joint_${i}`);
      expect(joint).toBeDefined();
      expect(joint?.type).toBe('revolute');
      expect(joint?.axis).toBeDefined();
      expect(joint?.limits).toBeDefined();
    }
  });

  it('should handle links without visual or collision elements', () => {
    const model = parseURDF(urdfString);
    const worldLink = model.links.get('world');
    
    expect(worldLink).toBeDefined();
    expect(worldLink?.visuals.length).toBe(0);
    expect(worldLink?.collisions.length).toBe(0);
  });
});
