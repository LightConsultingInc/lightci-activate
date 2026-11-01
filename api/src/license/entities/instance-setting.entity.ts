import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Small instance-wide key/value settings (today: a license uploaded through the admin UI). */
@Entity('instance_settings')
export class InstanceSetting {
  @PrimaryColumn('text') key: string;
  @Column('text') value: string;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
