import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('revisits')
export class Revisit {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column('uuid') personId: string;
  @Column('text') competencyCode: string;
  @Column('uuid', { nullable: true }) exerciseId: string | null;
  @Column('text') prompt: string; // 2–5 minute retrieval prompt
  @Column('text', { nullable: true }) answerKey: string | null;
  @Column('int', { default: 0 }) intervalStep: number; // index into [2,7,21,60,120]
  @Index() @Column('timestamptz') dueAt: Date;
  @Column('timestamptz', { nullable: true }) doneAt: Date | null;
  @Column('real', { nullable: true }) score: number | null;
  @Column('text', { nullable: true }) response: string | null;
  @Column('text', { nullable: true }) feedback: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
