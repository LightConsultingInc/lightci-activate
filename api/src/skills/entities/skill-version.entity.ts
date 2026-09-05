import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('skill_versions')
@Index(['skillId', 'version'], { unique: true })
export class SkillVersion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') skillId: string;
  @Column('int') version: number;
  @Column('text', { nullable: true }) commitSha: string | null;
  @Column('text', { nullable: true }) tag: string | null;
  @Column('text') skillMd: string;
  @Column('jsonb', { nullable: true }) manifest: Record<string, unknown> | null;
  @Column('text') changelog: string;
  @Column('uuid', { nullable: true }) authorPersonId: string | null;
  @Column('uuid', { nullable: true }) gradeId: string | null;
  @Column('real', { nullable: true }) gradeScore: number | null;
  @Column('text', { array: true, default: '{}' }) approverPersonIds: string[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
