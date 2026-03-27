import { Injectable } from '@nestjs/common';

@Injectable()
export class CatService {
  constructor() {}

  getMeow(): any {
    return {
      data: 'meow',
      success: true,
    };
  }
}
