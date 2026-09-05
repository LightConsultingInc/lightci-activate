import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cost_inputs')
export class CostInput {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column('uuid') orgId: string;
  @Column('real', { default: 0 }) seatPriceMonthly: number;
  @Column('real', { default: 0 }) premiumSeatPriceMonthly: number;
  @Column('real', { default: 0 }) loadedHourlyRate: number;
  @Column('real', { default: 0 }) lightciFeesMonthly: number;
  @Column('real', { default: 0 }) championHoursPerMonth: number;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
