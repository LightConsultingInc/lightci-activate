import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('skill_comments')
export class SkillComment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') skillId: string;
  @Column('uuid') personId: string;
  @Column('text') body: string;
  @Column('text', { default: 'feedback' }) kind:
    'feedback' | 'grader' | 'system';
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
