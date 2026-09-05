import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AssignmentMode = 'hidden' | 'available' | 'auto';

@Entity('skill_assignments')
@Index(['orgId', 'plugin', 'teamId'], { unique: true })
export class SkillAssignment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') orgId: string;
  @Column('text') plugin: string;
  @Column('uuid') teamId: string;
  @Column('text', { default: 'available' }) intendedMode: AssignmentMode;
  @Column('text', { nullable: true }) observedMode: AssignmentMode | null;
  @Column('timestamptz', { nullable: true }) observedAt: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
