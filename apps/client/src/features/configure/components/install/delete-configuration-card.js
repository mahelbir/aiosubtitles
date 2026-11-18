'use client';

import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Trash2Icon, TriangleAlertIcon} from 'lucide-react';
import {deleteUserConfigSchema} from '@repo/shared/schemas/user-config.js';
import {Form} from '@/components/form/form';
import {FormField} from '@/components/form/form-field';
import {SubmitButton} from '@/components/form/submit-button';
import {TextInput} from '@/components/form/text-input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useAppForm} from '@/lib/form';
import {useDeleteUserConfig, userConfigKeys} from '../../api';
import {CONFIGURE_SECTIONS} from '../../config/configure-sections';
import {useConfigureQuery} from '../../hooks/use-configure-query';
import {useLoadedUserConfig} from '../../hooks/use-loaded-user-config';
import {clearUserConfigSessionToken} from '../../lib/user-config-session';

const DELETE_LABEL = 'Delete configuration';

function DeleteConfigurationForm({onClose}) {
  const {userConfigId} = useLoadedUserConfig();
  const queryClient = useQueryClient();
  const [, setConfigureQuery] = useConfigureQuery();
  const [, setActiveSection] = useTabQuery(CONFIGURE_SECTIONS);
  const deleteMutation = useDeleteUserConfig({
    toast: true,
    onSuccess: deleted => {
      if (!deleted) {
        onClose();
        return;
      }
      setConfigureQuery({userConfigId: null, view: null});
      setActiveSection(null);
      clearUserConfigSessionToken(userConfigId);
      queryClient.removeQueries({
        queryKey: userConfigKeys.detail(userConfigId),
      });
    },
  });
  const form = useAppForm({
    defaultValues: {password: ''},
    schema: deleteUserConfigSchema,
    mutation: deleteMutation,
  });

  return (
    <Form form={form} aria-label={DELETE_LABEL} autoComplete="off">
      <AlertDialogHeader className="sm:grid-cols-[auto_1fr]">
        <AlertDialogMedia variant="destructive">
          <TriangleAlertIcon />
        </AlertDialogMedia>
        <AlertDialogTitle>Delete this configuration?</AlertDialogTitle>
        <AlertDialogDescription>
          Your settings and keys are removed for good. Subtitles already stored
          keep working.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <FormField name="password" className={null}>
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
        />
      </FormField>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <SubmitButton variant="destructive">{DELETE_LABEL}</SubmitButton>
      </AlertDialogFooter>
    </Form>
  );
}

export function DeleteConfigurationCard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete</CardTitle>
        <CardDescription>
          Remove this configuration and its keys from the server.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <Trash2Icon data-icon="inline-start" />
            {DELETE_LABEL}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <DeleteConfigurationForm onClose={() => setIsDialogOpen(false)} />
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
