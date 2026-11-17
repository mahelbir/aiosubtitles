import {Button} from '@/components/ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {LinkButton} from '@/components/common/link-button';

export function IconButton({children, title, variant = 'outline', ...props}) {
  if (props.href) {
    return (
      <LinkButton
        variant={variant}
        size="icon-sm"
        aria-label={title}
        {...props}
      >
        {children}
      </LinkButton>
    );
  }
  return (
    <Button
      variant={variant}
      size="icon-sm"
      aria-label={title}
      nativeButton={!props.render}
      {...props}
    >
      {children}
    </Button>
  );
}

export function TooltipIconButton({title, children, ...props}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconButton title={title} {...props}>
            {children}
          </IconButton>
        }
      />
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
