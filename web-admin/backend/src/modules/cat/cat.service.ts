import { Injectable } from '@nestjs/common';

@Injectable()
export class CatService {
  constructor() {}

  getMeow(): any {
    return {
      message: 'Cat says meow',
      data: 'meow',
    };
  }
}
