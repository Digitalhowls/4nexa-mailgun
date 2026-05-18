import { type VariantProps } from 'class-variance-authority';
import { type toastVariants } from './toast';

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = VariantProps<typeof toastVariants> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type State = { toasts: ToasterToast[] };
type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'DISMISS_TOAST': {
      const { toastId } = action;
      if (toastId) {
        setTimeout(() => dispatch({ type: 'REMOVE_TOAST', toastId }), TOAST_REMOVE_DELAY);
      } else {
        state.toasts.forEach((t) =>
          setTimeout(() => dispatch({ type: 'REMOVE_TOAST', toastId: t.id }), TOAST_REMOVE_DELAY),
        );
      }
      return {
        toasts: state.toasts.map((t) =>
          t.id === toastId || !toastId ? { ...t, open: false } : t,
        ),
      };
    }
    case 'REMOVE_TOAST':
      return {
        toasts: action.toastId ? state.toasts.filter((t) => t.id !== action.toastId) : [],
      };
  }
}

function toast(props: Omit<ToasterToast, 'id'>) {
  const id = genId();
  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dispatch({ type: 'DISMISS_TOAST', toastId: id });
      },
    },
  });
  return id;
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);
  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

import * as React from 'react';
export { useToast, toast };
