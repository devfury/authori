import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users (관리용)')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '사용자 목록 (비밀번호 제외)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: '사용자 추가 (이미 있으면 덮어씀)' })
  add(@Body() dto: CreateUserDto) {
    return this.usersService.add(dto);
  }

  @Delete(':email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '사용자 삭제' })
  remove(@Param('email') email: string) {
    const ok = this.usersService.remove(email);
    if (!ok) throw new NotFoundException(`User ${email} not found`);
  }
}
