// Storage abstraction: swap LocalStorage for an S3/Cloudinary class in production without touching routes.
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.resolve('uploads');

class LocalStorage {
  async save(buffer, originalName) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
    return `/uploads/${name}`;
  }
  async remove(url) { await fs.unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {}); }
}

// class S3Storage { async save(buffer, name) { /* PutObjectCommand ... return publicUrl */ } async remove(url) {} }

export const storage = new LocalStorage();
export { UPLOAD_DIR };
