// @flow
import os from 'os';
import path from 'path';
import { app, dialog, BrowserWindow, screen, shell } from 'electron';
import { client } from 'electron-connect';
import EventEmitter from 'events';
import { requestElectronStore } from './ipc/electronStoreConversation';
import { logger } from './utils/logging';
import {
  setupLogging,
  logSystemInfo,
  logStateSnapshot,
  generateWalletMigrationReport,
} from './utils/setupLogging';
import { handleDiskSpace } from './utils/handleDiskSpace';
import { handleCheckBlockReplayProgress } from './utils/handleCheckBlockReplayProgress';
import { createMainWindow } from './windows/main';
import { installChromeExtensions } from './utils/installChromeExtensions';
import { environment } from './environment';
import mainErrorHandler from './utils/mainErrorHandler';
import {
  launcherConfig,
  pubLogsFolderPath,
  stateDirectoryPath,
} from './config';
import { setupCardanoNode } from './cardano/setup';
import { CardanoNode } from './cardano/CardanoNode';
import { safeExitWithCode } from './utils/safeExitWithCode';
import { buildAppMenus } from './utils/buildAppMenus';
import { getLocale } from './utils/getLocale';
import { getRtsFlagsSettings } from './utils/rtsFlagSettings';
import { detectSystemLocale } from './utils/detectSystemLocale';
import { ensureXDGDataIsSet } from './cardano/config';
import { rebuildApplicationMenu } from './ipc/rebuild-application-menu';
import { getStateDirectoryPathChannel } from './ipc/getStateDirectoryPathChannel';
import { getDesktopDirectoryPathChannel } from './ipc/getDesktopDirectoryPathChannel';
import { getSystemLocaleChannel } from './ipc/getSystemLocaleChannel';
import type {
  GenerateWalletMigrationReportRendererRequest,
  SetStateSnapshotLogMainResponse,
} from '../common/ipc/api';
import { logUsedVersion } from './utils/logUsedVersion';
import { setStateSnapshotLogChannel } from './ipc/set-log-state-snapshot';
import { generateWalletMigrationReportChannel } from './ipc/generateWalletMigrationReportChannel';
import { enableApplicationMenuNavigationChannel } from './ipc/enableApplicationMenuNavigationChannel';
import {
  restoreSavedWindowBounds,
  saveWindowBoundsOnSizeAndPositionChange,
} from './windows/windowBounds';
import { safeExit } from './utils/safeExit';

/* eslint-disable consistent-return */

// Global references to windows to prevent them from being garbage collected
let mainWindow: BrowserWindow;
let cardanoNode: CardanoNode;

const {
  isDev,
  isTest,
  isWatchMode,
  isBlankScreenFixActive,
  isSelfnode,
  network,
  os: osName,
  version: daedalusVersion,
  nodeVersion: cardanoNodeVersion,
  apiVersion: cardanoWalletVersion,
  keepLocalClusterRunning,
} = environment;

if (isBlankScreenFixActive) {
  // Run "console.log(JSON.stringify(daedalus.stores.app.gpuStatus, null, 2))"
  // in DevTools JavaScript console to see if the flag is active
  app.disableHardwareAcceleration();
}

// Increase maximum event listeners to avoid IPC channel stalling
// (1/2) this line increases the limit for the main process
EventEmitter.defaultMaxListeners = 100; // Default: 10

app.allowRendererProcessReuse = true;

const onAppReady = async () => {
  setupLogging();
  logUsedVersion(
    environment.version,
    path.join(pubLogsFolderPath, 'Daedalus-versions.json')
  );

  const cpu = os.cpus();
  const platformVersion = os.release();
  const ram = JSON.stringify(os.totalmem(), null, 2);

  const startTime = new Date().toISOString();
  // first checks for Japanese locale, otherwise returns english
  const systemLocale = detectSystemLocale();
  const userLocale = getLocale(network);

  const systemInfo = logSystemInfo({
    cardanoNodeVersion,
    cardanoWalletVersion,
    cpu,
    daedalusVersion,
    isBlankScreenFixActive,
    network,
    osName,
    platformVersion,
    ram,
    startTime,
  });

  // We need DAEDALUS_INSTALL_DIRECTORY in PATH in order for the
  // cardano-launcher to find cardano-wallet and cardano-node executables
  process.env.PATH = [
    process.env.PATH,
    process.env.DAEDALUS_INSTALL_DIRECTORY,
  ].join(path.delimiter);

  logger.info(`Daedalus is starting at ${startTime}`, { startTime });

  logger.info('Updating System-info.json file', { ...systemInfo.data });

  logger.info(`Current working directory is: ${process.cwd()}`, {
    cwd: process.cwd(),
  });

  logger.info('System and user locale', { systemLocale, userLocale });

  ensureXDGDataIsSet();
  await installChromeExtensions(isDev);

  logger.info('Setting up Main Window...');
  mainWindow = createMainWindow(
    userLocale,
    restoreSavedWindowBounds(screen, requestElectronStore)
  );
  saveWindowBoundsOnSizeAndPositionChange(mainWindow, requestElectronStore);

  const rtsFlags = getRtsFlagsSettings(network) || [];

  logger.info(
    `Setting up Cardano Node... with flags: ${JSON.stringify(rtsFlags)}`
  );
  cardanoNode = setupCardanoNode(launcherConfig, mainWindow, rtsFlags);

  buildAppMenus(mainWindow, cardanoNode, userLocale, {
    isNavigationEnabled: false,
  });

  enableApplicationMenuNavigationChannel.onReceive(
    () =>
      new Promise((resolve) => {
        const locale = getLocale(network);
        buildAppMenus(mainWindow, cardanoNode, locale, {
          isNavigationEnabled: true,
        });
        resolve();
      })
  );

  rebuildApplicationMenu.onReceive(
    (data) =>
      new Promise((resolve) => {
        const locale = getLocale(network);
        buildAppMenus(mainWindow, cardanoNode, locale, {
          isNavigationEnabled: data.isNavigationEnabled,
        });
        mainWindow.updateTitle(locale);
        resolve();
      })
  );

  setStateSnapshotLogChannel.onReceive(
    (data: SetStateSnapshotLogMainResponse) => {
      return Promise.resolve(logStateSnapshot(data));
    }
  );

  generateWalletMigrationReportChannel.onReceive(
    (data: GenerateWalletMigrationReportRendererRequest) => {
      return Promise.resolve(generateWalletMigrationReport(data));
    }
  );

  getStateDirectoryPathChannel.onRequest(() =>
    Promise.resolve(stateDirectoryPath)
  );

  getDesktopDirectoryPathChannel.onRequest(() =>
    Promise.resolve(app.getPath('desktop'))
  );

  getSystemLocaleChannel.onRequest(() => Promise.resolve(systemLocale));

  const handleCheckDiskSpace = handleDiskSpace(mainWindow, cardanoNode);
  const onMainError = (error: string) => {
    if (error.indexOf('ENOSPC') > -1) {
      handleCheckDiskSpace();
      return false;
    }
  };
  mainErrorHandler(onMainError);
  await handleCheckDiskSpace();
  await handleCheckBlockReplayProgress(mainWindow, launcherConfig.logsPrefix);

  if (isWatchMode) {
    // Connect to electron-connect server which restarts / reloads windows on file changes
    client.create(mainWindow);
  }

  mainWindow.on('close', async (event) => {
    logger.info(
      'mainWindow received <close> event. Safe exiting Daedalus now.'
    );
    event.preventDefault();
    await safeExit(cardanoNode);
  });

  // Security feature: Prevent creation of new browser windows
  // https://github.com/electron/electron/blob/master/docs/tutorial/security.md#14-disable-or-limit-creation-of-new-windows
  app.on('web-contents-created', (_, contents) => {
    contents.on('new-window', (event, url) => {
      // Prevent creation of new BrowserWindows via links / window.open
      event.preventDefault();
      logger.info('Prevented creation of new browser window', { url });
      // Open these links with the default browser
      shell.openExternal(url);
    });
  });

  // Wait for controlled cardano-node shutdown before quitting the app
  app.on('before-quit', async (event) => {
    logger.info('app received <before-quit> event. Safe exiting Daedalus now.');
    event.preventDefault(); // prevent Daedalus from quitting immediately

    if (isSelfnode) {
      if (keepLocalClusterRunning || isTest) {
        logger.info(
          'ipcMain: Keeping the local cluster running while exiting Daedalus',
          {
            keepLocalClusterRunning,
          }
        );
        return safeExitWithCode(0);
      }

      const exitSelfnodeDialogOptions = {
        buttons: ['Yes', 'No'],
        type: 'warning',
        title: 'Daedalus is about to close',
        message: 'Do you want to keep the local cluster running?',
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      };
      const { response } = await dialog.showMessageBox(
        mainWindow,
        exitSelfnodeDialogOptions
      );
      if (response === 0) {
        logger.info(
          'ipcMain: Keeping the local cluster running while exiting Daedalus'
        );
        return safeExitWithCode(0);
      }
      logger.info('ipcMain: Exiting local cluster together with Daedalus');
    }

    await safeExit(cardanoNode);
  });
};

// Make sure this is the only Daedalus instance running per cluster before doing anything else
const isSingleInstance = app.requestSingleInstanceLock();

if (!isSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on('ready', onAppReady);
}
