import { Test, TestingModule } from '@nestjs/testing';
import { RocketChatService } from './rocketChat.service';

describe('RocketChatService', () => {
  let service: RocketChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RocketChatService],
    }).compile();

    service = module.get<RocketChatService>(RocketChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
