import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      data: { name: 'Seblak Prasmanan POS API', status: 'ok' },
      meta: null,
    };
  }
}
