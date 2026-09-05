import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthcheckModule } from './healthcheck/healthcheck.module';
import AppDataSource from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...AppDataSource.options, autoLoadEntities: true }),
    HealthcheckModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
