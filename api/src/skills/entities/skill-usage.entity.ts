import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_usage')
@Index(['skillId', 'personId', 'day'], { unique: true })
export class SkillUsage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') skillId: string;
  @Index() @Column('uuid') personId: string;
  @Column('uuid', { nullable: true }) teamId: string | null;
  @Column('date') day: string;
  @Column('int', { default: 0 }) activations: number;
}
