import { render, screen, fireEvent } from '@testing-library/react'
import LightboxMedia from '#/components/LightboxMedia'
import { makeMediaItem } from '#/test/fixtures'

describe('LightboxMedia', () => {
  describe('skeleton state', () => {
    it('shows skeleton when no thumbnail or full image loaded', () => {
      const item = makeMediaItem({ thumbnail_path: null })
      const { container } = render(<LightboxMedia item={item} />)
      const skeleton = container.querySelector(
        '[data-testid="lightbox-skeleton"]',
      )
      expect(skeleton).toBeTruthy()
    })

    it('uses item dimensions for skeleton aspect ratio', () => {
      const item = makeMediaItem({
        thumbnail_path: null,
        width: 1920,
        height: 1080,
      })
      const { container } = render(<LightboxMedia item={item} />)
      const skeleton = container.querySelector(
        '[data-testid="lightbox-skeleton"]',
      )
      expect(skeleton).toBeTruthy()
      const style = skeleton?.getAttribute('style')
      expect(style).toContain('aspect-ratio')
    })

    it('falls back to 4:3 when dimensions are null', () => {
      const item = makeMediaItem({
        thumbnail_path: null,
        width: null,
        height: null,
      })
      const { container } = render(<LightboxMedia item={item} />)
      const skeleton = container.querySelector(
        '[data-testid="lightbox-skeleton"]',
      )
      const style = skeleton?.getAttribute('style')
      expect(style).toContain('1.333')
    })
  })

  describe('thumbnail state', () => {
    it('renders thumbnail img when item has thumbnail_path', () => {
      const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      expect(thumbImg).toBeTruthy()
      expect(thumbImg?.getAttribute('src')).toContain('/thumbnail')
    })

    it('shows loading indicator when thumbnail loaded but full not loaded', () => {
      const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      fireEvent.load(thumbImg!)
      expect(screen.getByText('Loading full resolution')).toBeTruthy()
    })

    it('hides skeleton after thumbnail loads', () => {
      const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      fireEvent.load(thumbImg!)
      const skeleton = container.querySelector(
        '[data-testid="lightbox-skeleton"]',
      )
      expect(skeleton).toBeFalsy()
    })
  })

  describe('full resolution state', () => {
    it('renders full-res img with opacity 0 initially', () => {
      const item = makeMediaItem()
      const { container } = render(<LightboxMedia item={item} />)
      const fullImg = container.querySelector(
        'img[data-testid="lightbox-full"]',
      )
      expect(fullImg).toBeTruthy()
      expect(fullImg?.style.opacity).toBe('0')
    })

    it('sets full-res opacity to 1 after onLoad fires', () => {
      const item = makeMediaItem()
      const { container } = render(<LightboxMedia item={item} />)
      const fullImg = container.querySelector(
        'img[data-testid="lightbox-full"]',
      )
      fireEvent.load(fullImg!)
      expect(fullImg?.style.opacity).toBe('1')
    })

    it('hides loading indicator after full-res loads', () => {
      const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      fireEvent.load(thumbImg!)
      expect(screen.getByText('Loading full resolution')).toBeTruthy()
      const fullImg = container.querySelector(
        'img[data-testid="lightbox-full"]',
      )
      fireEvent.load(fullImg!)
      expect(screen.queryByText('Loading full resolution')).toBeFalsy()
    })
  })

  describe('video handling', () => {
    it('renders video element for video items', () => {
      const item = makeMediaItem({ media_type: 'video' })
      const { container } = render(<LightboxMedia item={item} />)
      const video = container.querySelector(
        'video[data-testid="lightbox-full-video"]',
      )
      expect(video).toBeTruthy()
      expect(video?.getAttribute('src')).toContain('/download')
    })

    it('shows thumbnail while video loads', () => {
      const item = makeMediaItem({
        media_type: 'video',
        thumbnail_path: '/thumbs/1.jpg',
      })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      expect(thumbImg).toBeTruthy()
    })

    it('crossfades video in on onLoadedData', () => {
      const item = makeMediaItem({ media_type: 'video' })
      const { container } = render(<LightboxMedia item={item} />)
      const video = container.querySelector(
        'video[data-testid="lightbox-full-video"]',
      )
      expect(video?.style.opacity).toBe('0')
      fireEvent.loadedData(video!)
      expect(video?.style.opacity).toBe('1')
    })
  })

  describe('error state', () => {
    it('shows error pill when full-res image fails to load', () => {
      const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      fireEvent.load(thumbImg!)
      const fullImg = container.querySelector(
        'img[data-testid="lightbox-full"]',
      )
      fireEvent.error(fullImg!)
      expect(screen.getByText('Failed to load')).toBeTruthy()
    })

    it('retries download when error pill clicked', () => {
      const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
      const { container } = render(<LightboxMedia item={item} />)
      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      fireEvent.load(thumbImg!)
      const fullImg = container.querySelector(
        'img[data-testid="lightbox-full"]',
      )
      fireEvent.error(fullImg!)
      const retryBtn = screen.getByText('Failed to load')
      fireEvent.click(retryBtn.closest('button')!)
      expect(screen.queryByText('Failed to load')).toBeFalsy()
    })
  })

  describe('navigation reset', () => {
    it('resets loading state when item changes', () => {
      const item1 = makeMediaItem({
        id: 100,
        thumbnail_path: '/thumbs/100.jpg',
      })
      const item2 = makeMediaItem({
        id: 200,
        thumbnail_path: '/thumbs/200.jpg',
      })
      const { container, rerender } = render(<LightboxMedia item={item1} />)

      const thumbImg = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      fireEvent.load(thumbImg!)
      expect(screen.getByText('Loading full resolution')).toBeTruthy()

      rerender(<LightboxMedia item={item2} />)
      const newThumb = container.querySelector(
        'img[data-testid="lightbox-thumbnail"]',
      )
      expect(newThumb?.getAttribute('src')).toContain('200')
    })
  })
})
