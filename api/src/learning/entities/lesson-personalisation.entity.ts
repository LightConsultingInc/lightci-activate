import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface LessonExample {
  title: string;
  text: string;
}
export interface LessonCheck {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

/** A lesson's example and check rewritten once for one person from their own workflows (task coach.personalise-lesson). */
@Entity('lesson_personalisations')
@Index(['personId', 'lessonSlug'], { unique: true })
export class LessonPersonalisation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') personId: string;
  @Column('text') lessonSlug: string;
  @Column('jsonb') example: LessonExample;
  @Column('jsonb') check: LessonCheck;
  @Column('text', { nullable: true }) model: string | null;
  /** Memory version the rewrite was based on; regenerated when the person's memory moves on. */
  @Column('int', { default: 0 }) memoryVersion: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
