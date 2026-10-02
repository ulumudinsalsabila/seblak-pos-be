import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class ProductImagesService {
  constructor(private readonly config: ConfigService) {}

  createUploadSignature(folder = 'seblak') {
    if (this.config.get('STORAGE_PROVIDER') !== 'cloudinary') {
      throw new ServiceUnavailableException(
        'Cloudinary storage is not enabled',
      );
    }

    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Cloudinary configuration is incomplete',
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      apiSecret,
    );

    return { cloudName, apiKey, timestamp, folder, signature };
  }
}
