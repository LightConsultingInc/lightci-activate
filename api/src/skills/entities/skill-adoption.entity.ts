import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('skill_adoptions')
@Index(['skillId', 'personId'], { unique: true })
export class SkillAdoption {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') skillId: string;
  @Column('uuid') personId: string;
  @Column('uuid', { nullable: true }) exerciseId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) adoptedAt: Date;
}
