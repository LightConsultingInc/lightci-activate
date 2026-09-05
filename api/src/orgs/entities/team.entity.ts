import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('teams')
export class Team {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') orgId: string;
  @Column('text') name: string;
  @Column('text') slug: string;
  @Column('text', { nullable: true }) rbacGroupId: string | null;
  @Column('text', { nullable: true }) pluginName: string | null;
  @Column('uuid', { nullable: true }) championPersonId: string | null;
  @Column('boolean', { default: true }) inProgram: boolean;
  @Column('text', { nullable: true }) purpose: string | null;
  @Column('date', { nullable: true }) programStartedOn: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
