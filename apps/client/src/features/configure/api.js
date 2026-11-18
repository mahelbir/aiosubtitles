import {env} from '@/config/env';
import {requestApi} from '@/lib/api-request';
import {useAppMutation, useAppQuery} from '@/lib/query';
import {useLoadedUserConfig} from './hooks/use-loaded-user-config';
import {
  isUserConfigSessionExpired,
  requestWithUserConfigSession,
} from './lib/user-config-session';

const USER_CONFIGS_PATH = '/api/user-configs';

export const userConfigKeys = {
  all: ['user-configs'],
  details: () => [...userConfigKeys.all, 'detail'],
  detail: userConfigId => [...userConfigKeys.details(), userConfigId],
};

export const subtitleSourceKeys = {
  all: ['subtitle-sources'],
  lists: () => [...subtitleSourceKeys.all, 'list'],
};

function getUserConfigPath(userConfigId) {
  return `${USER_CONFIGS_PATH}/${userConfigId}`;
}

function toSessionHeaders(sessionToken) {
  return {Authorization: `Bearer ${sessionToken}`};
}

export function createUserConfig(values) {
  return requestApi(env.API_URL, USER_CONFIGS_PATH, {
    method: 'POST',
    body: values,
    envelope: true,
  });
}

export function createUserConfigSession({userConfigId, password}) {
  return requestApi(
    env.API_URL,
    `${getUserConfigPath(userConfigId)}/sessions`,
    {
      method: 'POST',
      body: {password},
      envelope: true,
    },
  );
}

export function readUserConfig({userConfigId, sessionToken, signal}) {
  return requestApi(env.API_URL, getUserConfigPath(userConfigId), {
    signal,
    headers: toSessionHeaders(sessionToken),
  });
}

export function updateUserConfig({userConfigId, sessionToken, values}) {
  return requestApi(env.API_URL, getUserConfigPath(userConfigId), {
    method: 'PATCH',
    body: values,
    envelope: true,
    headers: toSessionHeaders(sessionToken),
  });
}

export function changeUserConfigPassword({
  userConfigId,
  sessionToken,
  currentPassword,
  newPassword,
}) {
  return requestApi(
    env.API_URL,
    `${getUserConfigPath(userConfigId)}/password`,
    {
      method: 'PUT',
      body: {currentPassword, newPassword},
      envelope: true,
      headers: toSessionHeaders(sessionToken),
    },
  );
}

export function deleteUserConfig({userConfigId, sessionToken, password}) {
  return requestApi(env.API_URL, getUserConfigPath(userConfigId), {
    method: 'DELETE',
    body: {password},
    envelope: true,
    headers: toSessionHeaders(sessionToken),
  });
}

export function checkUserConfigCredentials({userConfigId, sessionToken}) {
  return requestApi(
    env.API_URL,
    `${getUserConfigPath(userConfigId)}/credential-checks`,
    {
      method: 'POST',
      envelope: true,
      headers: toSessionHeaders(sessionToken),
    },
  );
}

export function listSubtitleSources({signal}) {
  return requestApi(env.API_URL, '/api/subtitle-sources', {signal});
}

export function useUserConfig(userConfigId, options) {
  return useAppQuery(
    {
      queryKey: userConfigKeys.detail(userConfigId),
      queryFn: ({signal}) =>
        requestWithUserConfigSession(userConfigId, sessionToken =>
          readUserConfig({userConfigId, sessionToken, signal}),
        ),
    },
    options,
  );
}

export function useSubtitleSources(options) {
  return useAppQuery(
    {
      queryKey: subtitleSourceKeys.lists(),
      queryFn: listSubtitleSources,
      staleTime: Infinity,
    },
    options,
  );
}

export function useCreateUserConfig(options) {
  return useAppMutation(
    {isFormBound: true, gcTime: 0, mutationFn: createUserConfig},
    options,
  );
}

export function useCreateUserConfigSession(options) {
  return useAppMutation(
    {isFormBound: true, gcTime: 0, mutationFn: createUserConfigSession},
    options,
  );
}

async function mutateWithUserConfigSession(userConfigId, request) {
  try {
    return await requestWithUserConfigSession(userConfigId, request);
  } catch (error) {
    if (isUserConfigSessionExpired(error)) {
      return null;
    }
    throw error;
  }
}

export function useUpdateUserConfig(userConfigId, options) {
  return useAppMutation(
    {
      isFormBound: true,
      mutationFn: values =>
        mutateWithUserConfigSession(userConfigId, sessionToken =>
          updateUserConfig({userConfigId, sessionToken, values}),
        ),
      invalidates: userConfigKeys.detail(userConfigId),
    },
    options,
  );
}

const FORM_MUTATION_OPTIONS = {isFormBound: true, gcTime: 0};

function useLoadedUserConfigMutation(request, selfOptions, options) {
  const {userConfigId, requestPassword} = useLoadedUserConfig();
  return useAppMutation(
    {
      ...selfOptions,
      mutationFn: variables =>
        mutateWithUserConfigSession(userConfigId, sessionToken =>
          request({...variables, userConfigId, sessionToken}),
        ),
      onSuccess: result => {
        if (result === null) {
          requestPassword();
        }
      },
    },
    options,
  );
}

export function useChangeUserConfigPassword(options) {
  return useLoadedUserConfigMutation(
    changeUserConfigPassword,
    FORM_MUTATION_OPTIONS,
    options,
  );
}

export function useDeleteUserConfig(options) {
  return useLoadedUserConfigMutation(
    deleteUserConfig,
    FORM_MUTATION_OPTIONS,
    options,
  );
}

export function useCheckUserConfigCredentials(options) {
  return useLoadedUserConfigMutation(
    checkUserConfigCredentials,
    {invalidates: userConfigKeys.details()},
    options,
  );
}
