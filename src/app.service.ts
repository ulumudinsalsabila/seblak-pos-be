import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      data: { name: 'Saung Sunja POS API', status: 'ok' },
      meta: null,
    };
  }
}
