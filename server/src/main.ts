import { ConfigService } from '@nestjs/config';
import { NestApplication, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * @class EditorServerEntryPoint
 * @author EoJinSeok
 * @description
 * This class is entry point of editor server.
 */
class EditorServerEntryPoint {
  private _app: NestApplication;
  private _isReady: boolean;
  private _configService: ConfigService;

  constructor() {
    this._app = null;
    this._isReady = false;
  }

  async initWithApp() {
    try {
      this._app = await NestFactory.create(AppModule);
      this._configService = this._app.get(ConfigService);

      this._isReady = true;
    } catch (e) {
      this._isReady = false;
    }

    return this;
  }

  async start() {
    process.on('unhandledRejection', (reason: any, proc: Promise<any>) => {
      console.error(reason.message);
    });
    process.on('uncaughtException', (err) => {
      console.error(err);
    });
    process.on('SIGINT', () => {
      this._app.close();
    });
    process.on('SIGTERM', () => {
      this._app.close();
    });
    const PORT = this._configService.get('server.port');
    await this._app.listen(+PORT);
  }
}

const app = new EditorServerEntryPoint();
app
  .initWithApp()
  .then(() => app.start())
  .catch((err) => {
    console.error(err);
  });
