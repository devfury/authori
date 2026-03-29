import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateUserDto, UserRecord } from './dto/user.dto';

const DEFAULT_USERS: UserRecord[] = [
  {
    email: 'alice@example.com',
    password: 'alice123',
    name: 'Alice Kim',
    loginId: 'alice',
    profile: { department: 'engineering', role: 'developer' },
  },
  {
    email: 'bob@example.com',
    password: 'bob123',
    name: 'Bob Lee',
    loginId: 'bob',
    profile: { department: 'sales', role: 'manager' },
  },
];

@Injectable()
export class UsersService implements OnModuleInit {
  private users: UserRecord[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('USERS_JSON');
    if (raw) {
      try {
        this.users = JSON.parse(raw) as UserRecord[];
        return;
      } catch {
        console.warn('USERS_JSON 파싱 실패 — 기본 사용자 사용');
      }
    }
    this.users = [...DEFAULT_USERS];
  }

  findByEmail(email: string): UserRecord | undefined {
    return this.users.find((u) => u.email === email);
  }

  findAll(): Omit<UserRecord, 'password'>[] {
    return this.users.map(({ password: _, ...rest }) => rest);
  }

  add(dto: CreateUserDto): Omit<UserRecord, 'password'> {
    const existing = this.findByEmail(dto.email);
    if (existing) {
      // 덮어쓰기
      Object.assign(existing, dto);
    } else {
      this.users.push({ ...dto });
    }
    const { password: _, ...rest } = dto;
    return rest;
  }

  remove(email: string): boolean {
    const idx = this.users.findIndex((u) => u.email === email);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    return true;
  }
}
