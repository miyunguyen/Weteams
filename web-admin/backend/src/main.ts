import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppExceptionFilter } from './common/filters/app-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AppExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('WeTeams Backend API')
    .setDescription('REST API documentation for WeTeams backend')
    .setVersion('1.0')
    .addTag('v1')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('v1/docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
