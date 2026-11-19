import type { Option } from '@fixture/peer/sub';
import type { Hidden } from '@fixture/peer/deep/hidden';

export interface Row {
  readonly option: Option;
  readonly hidden: Hidden;
}
