export interface ExtensionPermissionDescriptor {
  permissions?: string[];
}

export interface ExtensionPermissionChangeEventLike {
  addListener(listener: (permissions: ExtensionPermissionDescriptor) => void): void;
  removeListener?(listener: (permissions: ExtensionPermissionDescriptor) => void): void;
}

export interface ExtensionPermissionsLike {
  contains(details: ExtensionPermissionDescriptor): Promise<boolean> | boolean;
  request(details: ExtensionPermissionDescriptor): Promise<boolean> | boolean;
  remove(details: ExtensionPermissionDescriptor): Promise<boolean> | boolean;
  onAdded?: ExtensionPermissionChangeEventLike;
  onRemoved?: ExtensionPermissionChangeEventLike;
}

interface ExtensionPermissionsGlobal {
  browser?: {
    permissions?: ExtensionPermissionsLike;
  };
  chrome?: {
    permissions?: ExtensionPermissionsLike;
  };
}

export interface HighFidelityRenderingAvailability {
  permissionGranted: boolean;
  preferenceEnabled: boolean;
}

export type HighFidelityRenderingStatus = 'off' | 'available' | 'enabled';

export const highFidelityPermissionDescriptor = {
  permissions: ['debugger']
} as const satisfies ExtensionPermissionDescriptor;

function getExtensionPermissionsGlobal(): ExtensionPermissionsGlobal {
  return globalThis as typeof globalThis & ExtensionPermissionsGlobal;
}

function includesDebuggerPermission(permissions: ExtensionPermissionDescriptor | undefined): boolean {
  return Boolean(permissions?.permissions?.includes('debugger'));
}

export function getExtensionPermissions(): ExtensionPermissionsLike | undefined {
  const extensionApi = getExtensionPermissionsGlobal();
  return extensionApi.browser?.permissions ?? extensionApi.chrome?.permissions;
}

export async function containsHighFidelityPermission(
  permissions: ExtensionPermissionsLike = getRequiredPermissionsApi()
): Promise<boolean> {
  return Boolean(await permissions.contains(highFidelityPermissionDescriptor));
}

export async function requestHighFidelityPermission(
  permissions: ExtensionPermissionsLike = getRequiredPermissionsApi()
): Promise<boolean> {
  return Boolean(await permissions.request(highFidelityPermissionDescriptor));
}

export async function removeHighFidelityPermission(
  permissions: ExtensionPermissionsLike = getRequiredPermissionsApi()
): Promise<boolean> {
  return Boolean(await permissions.remove(highFidelityPermissionDescriptor));
}

export function resolveHighFidelityRenderingStatus(
  resolution: HighFidelityRenderingAvailability
): HighFidelityRenderingStatus {
  if (!resolution.permissionGranted) {
    return 'off';
  }

  return resolution.preferenceEnabled ? 'enabled' : 'available';
}

export function getHighFidelityRenderingStatusLabel(status: HighFidelityRenderingStatus): string {
  switch (status) {
    case 'enabled':
      return 'Enabled';
    case 'available':
      return 'Available';
    default:
      return 'Off';
  }
}

export function observeHighFidelityPermissionState(
  listener: (permissionGranted: boolean) => void,
  permissions?: ExtensionPermissionsLike
): () => void {
  const resolvedPermissions = permissions ?? getExtensionPermissions();

  if (!resolvedPermissions) {
    return () => undefined;
  }

  const handleAdded = (permissionChange: ExtensionPermissionDescriptor) => {
    if (includesDebuggerPermission(permissionChange)) {
      listener(true);
    }
  };
  const handleRemoved = (permissionChange: ExtensionPermissionDescriptor) => {
    if (includesDebuggerPermission(permissionChange)) {
      listener(false);
    }
  };

  resolvedPermissions.onAdded?.addListener(handleAdded);
  resolvedPermissions.onRemoved?.addListener(handleRemoved);

  return () => {
    resolvedPermissions.onAdded?.removeListener?.(handleAdded);
    resolvedPermissions.onRemoved?.removeListener?.(handleRemoved);
  };
}

function getRequiredPermissionsApi(): ExtensionPermissionsLike {
  const permissions = getExtensionPermissions();

  if (!permissions) {
    throw new Error('Extension permissions API is unavailable.');
  }

  return permissions;
}
