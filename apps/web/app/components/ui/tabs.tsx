import { Tabs as TabsPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('artifact-tabs-list', className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('artifact-tabs-trigger', className)} {...props} />;
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('artifact-tabs-content', className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
