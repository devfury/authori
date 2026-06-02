import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, UserProfile } from '../../database/entities';
import { UsersModule } from '../../users/users.module';
import { TokenVerifierModule } from '../token-verifier/token-verifier.module';
import { UserInfoController } from './userinfo.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserProfile]),
    UsersModule,
    TokenVerifierModule,
  ],
  controllers: [UserInfoController],
})
export class UserInfoModule {}
