import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('Test Web Server')
    .setDescription(
      'Authori 서비스의 Client Credentials 플로우를 테스트하는 예제 서버입니다.\n\n' +
      '## 테스트 순서\n' +
      '1. `POST /token` — client_id / client_secret으로 액세스 토큰 발급\n' +
      '2. `GET /token/decode` — 발급된 JWT 클레임 확인\n' +
      '3. `GET /api/resource` — Bearer 토큰으로 보호된 리소스 호출',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Test Web Server running on http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/docs`);
}
bootstrap();
