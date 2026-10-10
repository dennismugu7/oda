import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { ShopLinkText } from './shopLink';

describe('ShopLinkText', () => {
  it('keeps a long link on one line, ending in "…", and not selectable (Android ignores the line limit then)', async () => {
    const url = 'oda-eta.vercel.app/a-very-long-shop-link-name-that-never-fits-1234';
    await render(<ShopLinkText url={url} />);
    const link = screen.getByText(url);
    expect(link.props.numberOfLines).toBe(1);
    expect(link.props.ellipsizeMode).toBe('tail');
    expect(link.props.selectable).toBeFalsy();
  });

  it('shows the link name apart from the address', async () => {
    await render(<ShopLinkText url="oda.mugu-labs.com/amani-styles" />);
    expect(screen.getByText('amani-styles')).toBeTruthy();
  });
});
