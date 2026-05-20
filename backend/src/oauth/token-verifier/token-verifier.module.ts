import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessToken } from '../../database/entities';
import { KeysModule } from '../keys/keys.module';
import { OAuthTokenVerifierService } from './oauth-token-verifier.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccessToken]), KeysModule],
  providers: [OAuthTokenVerifierService],
  exports: [OAuthTokenVerifierService],
})
export class TokenVerifierModule {}
