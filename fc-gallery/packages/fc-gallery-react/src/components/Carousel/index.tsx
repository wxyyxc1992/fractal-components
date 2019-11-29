import React from 'react';
import { Swipeable } from 'react-swipeable';
import throttle from 'lodash.throttle';
import debounce from 'lodash.debounce';
import ResizeObserver from 'resize-observer-polyfill';
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css';

import './index.less';
import X from '../../assets/X.svg';
import { Image } from '../../types';

const screenChangeEvents = [
  'fullscreenchange',
  'MSFullscreenChange',
  'mozfullscreenchange',
  'webkitfullscreenchange'
];

export interface ICarouselProps {
  flickThreshold: number;
  items: Image[];

  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailPosition: string;
  disableThumbnailScroll: boolean;
  slideOnThumbnailOver: boolean;
  thumbnailWithLightbox: boolean;

  showNav: boolean;
  autoPlay: boolean;
  lazyLoad: boolean;
  infinite: boolean;
  showIndex: boolean;
  showBullets: boolean;
  showSlider: boolean;
  showThumbnails: boolean;
  showPlayButton: boolean;
  showFullscreenButton: boolean;
  disableArrowKeys: boolean;
  disableSwipe: boolean;
  useBrowserFullscreen: boolean;
  preventDefaultTouchmoveEvent: boolean;
  defaultImage: string;
  indexSeparator: string;
  startIndex: number;
  slideDuration: number;
  slideInterval: number;
  swipeThreshold: number;
  swipingTransitionDuration: number;

  onSlide: any;
  onScreenChange: any;
  onPause: any;
  onPlay: any;
  onClick: any;
  onImageLoad: any;
  onImageError: any;
  onTouchMove: any;
  onTouchEnd: any;
  onTouchStart: any;
  onMouseOver: any;
  onMouseLeave: any;
  onThumbnailError: any;
  onThumbnailClick: any;
  onThumbnailDelete: any;
  onBulletClick: any;

  renderCustomControls: any;
  renderLeftNav: any;
  renderRightNav: any;
  renderPlayPauseButton: any;
  renderFullscreenButton: any;
  renderItem: any;
  renderThumbInner: any;

  stopPropagation: boolean;
  additionalClass: string;
  useTranslate3D: boolean;
  isRTL: boolean;
}

export interface ICarouselState {
  currentIndex: number;
  offsetPercentage: number;
  galleryWidth: number;
  thumbsTranslate: number;
  // 水平状态下缩略图的总外部容器的宽度
  thumbnailsWrapperWidth: number;
  // 垂直状态下缩略图的总外部容器的高度
  thumbnailsWrapperHeight: number;

  style?: any;

  isFullscreen: boolean;
  isPlaying: boolean;
  isTransitioning?: boolean;
}

export class Carousel extends React.Component<Partial<ICarouselProps>, any> {
  static defaultProps = {
    items: [],

    showThumbnails: true,
    thumbnailWidth: 200,
    thumbnailHeight: 150,
    thumbnailWithLightbox: true,
    thumbnailPosition: 'bottom',
    disableThumbnailScroll: false,

    showNav: true,
    autoPlay: false,
    lazyLoad: false,
    infinite: true,
    showSlider: true,
    showIndex: false,
    showBullets: false,
    showPlayButton: true,
    showFullscreenButton: true,
    disableArrowKeys: false,
    disableSwipe: false,
    useTranslate3D: true,
    isRTL: false,
    useBrowserFullscreen: true,
    preventDefaultTouchmoveEvent: false,
    flickThreshold: 0.4,
    stopPropagation: false,
    indexSeparator: ' / ',
    startIndex: 0,
    slideDuration: 450,
    swipingTransitionDuration: 0,
    slideInterval: 3000,
    swipeThreshold: 30,

    renderLeftNav: (onClick, disabled) => {
      return (
        <button
          type="button"
          className="fc-gallery-carousel-left-nav"
          disabled={disabled}
          onClick={onClick}
          aria-label="Previous Slide"
        />
      );
    },

    renderRightNav: (onClick, disabled) => {
      return (
        <button
          type="button"
          className="fc-gallery-carousel-right-nav"
          disabled={disabled}
          onClick={onClick}
          aria-label="Next Slide"
        />
      );
    },

    renderPlayPauseButton: (onClick, isPlaying) => {
      return (
        <button
          type="button"
          className={`fc-gallery-carousel-play-button${isPlaying ? ' active' : ''}`}
          onClick={onClick}
          aria-label="Play or Pause Slideshow"
        />
      );
    },

    renderFullscreenButton: (onClick, isFullscreen) => {
      return (
        <button
          type="button"
          className={`fc-gallery-carousel-fullscreen-button${isFullscreen ? ' active' : ''}`}
          onClick={onClick}
          aria-label="Open Fullscreen"
        />
      );
    }
  };

  resizeObserver: ResizeObserver;
  direction: string;

  _unthrottledSlideToIndex: any;
  _lazyLoaded: boolean[];
  _intervalId: number | null;
  _transitionTimer: number | null;
  _thumbnailMouseOverTimer: number | null;
  _thumbnails: any;
  _imageGallerySlideWrapper: any;
  _thumbnailsWrapper: any;
  _imageGallery: any;

  constructor(props) {
    super(props);
    this.state = {
      currentIndex: props.startIndex,
      offsetPercentage: 0,
      galleryWidth: 0,
      isFullscreen: false,
      isPlaying: false,

      thumbsTranslate: 0,
      thumbnailsWrapperWidth: 0,
      thumbnailsWrapperHeight: 0,
      showLightbox: false,
      thumbnialImageIndex: 0
    };

    // Used to update the throttle if slideDuration changes
    this._unthrottledSlideToIndex = this.slideToIndex;
    this.slideToIndex = throttle(this._unthrottledSlideToIndex, props.slideDuration, {
      trailing: false
    });

    if (props.lazyLoad) {
      this._lazyLoaded = [];
    }
  }

  componentDidMount() {
    if (this.props.autoPlay) {
      this.play();
    }
    window.addEventListener('keydown', this._handleKeyDown);
    this._onScreenChangeEvent();
  }

  componentDidUpdate(prevProps, prevState) {
    const itemsSizeChanged = prevProps.items.length !== this.props.items!.length;
    const itemsChanged = JSON.stringify(prevProps.items) !== JSON.stringify(this.props.items);
    const startIndexUpdated = prevProps.startIndex !== this.props.startIndex;
    if (itemsSizeChanged) {
      this._handleResize();
    }
    if (prevState.currentIndex !== this.state.currentIndex) {
      this._slideThumbnailBar(prevState.currentIndex);
    }
    // if slideDuration changes, update slideToIndex throttle
    if (prevProps.slideDuration !== this.props.slideDuration) {
      this.slideToIndex = throttle(this._unthrottledSlideToIndex, this.props.slideDuration, {
        trailing: false
      });
    }
    if (this.props.lazyLoad && (!prevProps.lazyLoad || itemsChanged)) {
      this._lazyLoaded = [];
    }

    if (startIndexUpdated || itemsChanged) {
      this.setState({ currentIndex: this.props.startIndex });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._handleKeyDown);

    this._offScreenChangeEvent();

    if (this._intervalId) {
      window.clearInterval(this._intervalId);
      this._intervalId = null;
    }

    if (this.resizeObserver && this._imageGallerySlideWrapper) {
      this.resizeObserver.unobserve(this._imageGallerySlideWrapper);
    }

    if (this._transitionTimer) {
      window.clearTimeout(this._transitionTimer);
    }

    if (this._createResizeObserver) {
      this._createResizeObserver();
    }
  }

  play(callback = true) {
    if (!this._intervalId) {
      const { slideInterval, slideDuration } = this.props;
      this.setState({ isPlaying: true });
      this._intervalId = window.setInterval(() => {
        if (!this.props.infinite && !this._canSlideRight()) {
          this.pause();
        } else {
          this.slideToIndex(this.state.currentIndex + 1);
        }
      }, Math.max(slideInterval || 0, slideDuration || 0));

      if (this.props.onPlay && callback) {
        this.props.onPlay(this.state.currentIndex);
      }
    }
  }

  pause(callback = true) {
    if (this._intervalId) {
      window.clearInterval(this._intervalId);
      this._intervalId = null;
      this.setState({ isPlaying: false });

      if (this.props.onPause && callback) {
        this.props.onPause(this.state.currentIndex);
      }
    }
  }

  setModalFullscreen(state) {
    this.setState({ modalFullscreen: state });
    // manually call because browser does not support screenchange events
    if (this.props.onScreenChange) {
      this.props.onScreenChange(state);
    }
  }

  fullScreen() {
    const gallery = this._imageGallery;

    if (this.props.useBrowserFullscreen) {
      if (gallery.requestFullscreen) {
        gallery.requestFullscreen();
      } else if (gallery.msRequestFullscreen) {
        gallery.msRequestFullscreen();
      } else if (gallery.mozRequestFullScreen) {
        gallery.mozRequestFullScreen();
      } else if (gallery.webkitRequestFullscreen) {
        gallery.webkitRequestFullscreen();
      } else {
        // fallback to fullscreen modal for unsupported browsers
        this.setModalFullscreen(true);
      }
    } else {
      this.setModalFullscreen(true);
    }

    this.setState({ isFullscreen: true });
  }

  exitFullScreen() {
    if (this.state.isFullscreen) {
      if (this.props.useBrowserFullscreen) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          (document as any).msExitFullscreen();
        } else {
          // fallback to fullscreen modal for unsupported browsers
          this.setModalFullscreen(false);
        }
      } else {
        this.setModalFullscreen(false);
      }

      this.setState({ isFullscreen: false });
    }
  }

  slideToIndex = (index, event?) => {
    const { currentIndex, isTransitioning } = this.state;

    if (!isTransitioning) {
      if (event) {
        if (this._intervalId) {
          // user triggered event while ImageGallery is playing, reset interval
          this.pause(false);
          this.play(false);
        }
      }

      const slideCount = this.props.items!.length - 1;
      let nextIndex = index;

      if (index < 0) {
        nextIndex = slideCount;
      } else if (index > slideCount) {
        nextIndex = 0;
      }

      this.setState(
        {
          previousIndex: currentIndex,
          currentIndex: nextIndex,
          isTransitioning: nextIndex !== currentIndex,
          offsetPercentage: 0,
          style: {
            transition: `all ${this.props.slideDuration}ms ease-out`
          }
        },
        this._onSliding
      );
    }
  };

  _onSliding = () => {
    const { isTransitioning } = this.state;
    this._transitionTimer = window.setTimeout(() => {
      if (isTransitioning) {
        this.setState({ isTransitioning: !isTransitioning });
        if (this.props.onSlide) {
          this.props.onSlide(this.state.currentIndex);
        }
      }
    }, (this.props.slideDuration || 0) + 50);
  };

  getCurrentIndex() {
    return this.state.currentIndex;
  }

  _handleScreenChange = () => {
    /*
      handles screen change events that the browser triggers e.g. esc key
    */
    const fullScreenElement =
      document.fullscreenElement ||
      (document as any).msFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).webkitFullscreenElement;

    if (this.props.onScreenChange) {
      this.props.onScreenChange(fullScreenElement);
    }

    this.setState({ isFullscreen: !!fullScreenElement });
  };

  _onScreenChangeEvent() {
    screenChangeEvents.map(eventName => {
      document.addEventListener(eventName, this._handleScreenChange);
    });
  }

  _offScreenChangeEvent() {
    screenChangeEvents.map(eventName => {
      document.removeEventListener(eventName, this._handleScreenChange);
    });
  }

  _toggleFullScreen = () => {
    if (this.state.isFullscreen) {
      this.exitFullScreen();
    } else {
      this.fullScreen();
    }
  };

  _togglePlay = () => {
    if (this._intervalId) {
      this.pause();
    } else {
      this.play();
    }
  };

  _initGalleryResizing = element => {
    /*
      When fc-gallery-carousel-slide-wrapper unmounts and mounts when thumbnail bar position is changed
      ref is called twice, once with null and another with the element.
      Make sure element is available before calling observe.
    */
    if (element) {
      this._imageGallerySlideWrapper = element;
      this.resizeObserver = new ResizeObserver(this._createResizeObserver);
      this.resizeObserver.observe(element);
    }
  };

  _createResizeObserver = debounce(entries => {
    if (!entries) return;
    entries.forEach(() => {
      this._handleResize();
    });
  }, 300);

  _handleResize = () => {
    const { currentIndex } = this.state;
    if (this._imageGallery) {
      this.setState({
        galleryWidth: this._imageGallery.offsetWidth
      });
    }

    if (this._imageGallerySlideWrapper) {
      this.setState({
        gallerySlideWrapperHeight: this._imageGallerySlideWrapper.offsetHeight
      });
    }

    if (this._thumbnailsWrapper) {
      if (this._isThumbnailVertical()) {
        this.setState({ thumbnailsWrapperHeight: this._thumbnailsWrapper.offsetHeight });
      } else {
        this.setState({ thumbnailsWrapperWidth: this._thumbnailsWrapper.offsetWidth });
      }
    }

    // Adjust thumbnail container when thumbnail width or height is adjusted
    this._setThumbsTranslate(-(this._getThumbsTranslate(currentIndex) || 0));
  };

  _isThumbnailVertical() {
    const { thumbnailPosition } = this.props;
    return thumbnailPosition === 'left' || thumbnailPosition === 'right';
  }

  _handleKeyDown = event => {
    if (this.props.disableArrowKeys) {
      return;
    }
    const LEFT_ARROW = 37;
    const RIGHT_ARROW = 39;
    const ESC_KEY = 27;
    const key = parseInt(event.keyCode || event.which || 0);

    switch (key) {
      case LEFT_ARROW:
        if (this._canSlideLeft() && !this._intervalId) {
          this._slideLeft();
        }
        break;
      case RIGHT_ARROW:
        if (this._canSlideRight() && !this._intervalId) {
          this._slideRight();
        }
        break;
      case ESC_KEY:
        if (this.state.isFullscreen && !this.props.useBrowserFullscreen) {
          this.exitFullScreen();
        }
    }
  };

  _handleImageError = event => {
    if (this.props.defaultImage && event.target.src.indexOf(this.props.defaultImage) === -1) {
      event.target.src = this.props.defaultImage;
    }
  };

  _setScrollDirection(dir) {
    const { scrollingUpDown, scrollingLeftRight } = this.state;

    if (!scrollingUpDown && !scrollingLeftRight) {
      if (dir === 'Left' || dir === 'Right') {
        this.setState({ scrollingLeftRight: true });
      } else {
        this.setState({ scrollingUpDown: true });
      }
    }
  }

  _handleOnSwiped = ({ event, dir, velocity }) => {
    if (this.props.disableSwipe) return;
    const { scrollingUpDown, scrollingLeftRight } = this.state;
    const { isRTL } = this.props;
    if (this.props.stopPropagation) event.stopPropagation();
    if (scrollingUpDown) {
      // user stopped scrollingUpDown
      this.setState({ scrollingUpDown: false });
    }

    if (scrollingLeftRight) {
      // user stopped scrollingLeftRight
      this.setState({ scrollingLeftRight: false });
    }

    if (!scrollingUpDown) {
      // don't swipe if user is scrolling
      const side = (dir === 'Left' ? 1 : -1) * (isRTL ? -1 : 1); // if it is RTL the direction is reversed
      const isFlick = velocity > (this.props.flickThreshold || 0);
      this._handleOnSwipedTo(side, isFlick);
    }
  };

  _handleOnSwipedTo(side, isFlick) {
    const { currentIndex, isTransitioning } = this.state;
    let slideTo = currentIndex;

    if ((this._sufficientSwipeOffset() || isFlick) && !isTransitioning) {
      slideTo += side;
    }

    if (side < 0) {
      if (!this._canSlideLeft()) {
        slideTo = currentIndex;
      }
    } else {
      if (!this._canSlideRight()) {
        slideTo = currentIndex;
      }
    }

    this._unthrottledSlideToIndex(slideTo);
  }

  _sufficientSwipeOffset() {
    return Math.abs(this.state.offsetPercentage) > (this.props.swipeThreshold || 0);
  }

  _handleSwiping = ({ event, absX, dir }) => {
    const { thumbnailWidth = 0 } = this.props;
    if (this.props.disableSwipe) return;
    const { galleryWidth, isTransitioning, scrollingUpDown, scrollingLeftRight } = this.state;
    const { swipingTransitionDuration } = this.props;
    this._setScrollDirection(dir);
    if (this.props.stopPropagation) event.stopPropagation();
    if ((this.props.preventDefaultTouchmoveEvent || scrollingLeftRight) && event.cancelable)
      event.preventDefault();
    if (!isTransitioning && !scrollingUpDown) {
      const side = dir === 'Right' ? 1 : -1;

      let offsetPercentage = (absX / galleryWidth) * thumbnailWidth;
      if (Math.abs(offsetPercentage) >= thumbnailWidth) {
        offsetPercentage = thumbnailWidth;
      }

      const swipingTransition = {
        transition: `transform ${swipingTransitionDuration}ms ease-out`
      };

      this.setState({
        offsetPercentage: side * offsetPercentage,
        style: swipingTransition
      });
    } else {
      // don't move the slide
      this.setState({ offsetPercentage: 0 });
    }
  };

  _canNavigate() {
    return this.props.items!.length >= 2;
  }

  _canSlideLeft() {
    return (
      this.props.infinite || (this.props.isRTL ? this._canSlideNext() : this._canSlidePrevious())
    );
  }

  _canSlideRight() {
    return (
      this.props.infinite || (this.props.isRTL ? this._canSlidePrevious() : this._canSlideNext())
    );
  }

  _canSlidePrevious() {
    return this.state.currentIndex > 0;
  }

  _canSlideNext() {
    return this.state.currentIndex < this.props.items!.length - 1;
  }

  _slideThumbnailBar(previousIndex) {
    const { thumbsTranslate, currentIndex } = this.state;
    if (this.state.currentIndex === 0) {
      this._setThumbsTranslate(0);
    } else {
      const indexDifference = Math.abs(previousIndex - currentIndex);
      const scroll = this._getThumbsTranslate(indexDifference) || 0;
      if (scroll > 0) {
        if (previousIndex < currentIndex) {
          this._setThumbsTranslate(thumbsTranslate - scroll);
        } else if (previousIndex > currentIndex) {
          this._setThumbsTranslate(thumbsTranslate + scroll);
        }
      }
    }
  }

  _setThumbsTranslate(thumbsTranslate?) {
    this.setState({ thumbsTranslate });
  }

  _getThumbsTranslate(indexDifference?) {
    if (this.props.disableThumbnailScroll) {
      return 0;
    }

    const { thumbnailsWrapperWidth, thumbnailsWrapperHeight } = this.state;
    let totalScroll;

    if (this._thumbnails) {
      // total scroll required to see the last thumbnail
      if (this._isThumbnailVertical()) {
        if (this._thumbnails.scrollHeight <= thumbnailsWrapperHeight) {
          return 0;
        }
        totalScroll = this._thumbnails.scrollHeight - thumbnailsWrapperHeight;
      } else {
        if (this._thumbnails.scrollWidth <= thumbnailsWrapperWidth || thumbnailsWrapperWidth <= 0) {
          return 0;
        }
        totalScroll = this._thumbnails.scrollWidth - thumbnailsWrapperWidth;
      }

      const totalThumbnails = this._thumbnails.children.length;
      // scroll-x required per index change
      const perIndexScroll = totalScroll / (totalThumbnails - 1);

      return indexDifference * perIndexScroll;
    }

    return 0;
  }

  _getAlignmentClassName(index) {
    /*
      Necessary for lazing loading
    */
    const { items = [] } = this.props;
    const { currentIndex } = this.state;
    let alignment = '';
    const leftClassName = 'left';
    const centerClassName = 'center';
    const rightClassName = 'right';

    switch (index) {
      case currentIndex - 1:
        alignment = ` ${leftClassName}`;
        break;
      case currentIndex:
        alignment = ` ${centerClassName}`;
        break;
      case currentIndex + 1:
        alignment = ` ${rightClassName}`;
        break;
    }

    if (items.length >= 3 && this.props.infinite) {
      if (index === 0 && currentIndex === items.length - 1) {
        // set first slide as right slide if were sliding right from last slide
        alignment = ` ${rightClassName}`;
      } else if (index === items.length - 1 && currentIndex === 0) {
        // set last slide as left slide if were sliding left from first slide
        alignment = ` ${leftClassName}`;
      }
    }

    return alignment;
  }

  _isGoingFromFirstToLast() {
    const { currentIndex, previousIndex } = this.state;
    const totalSlides = this.props.items!.length - 1;
    return previousIndex === 0 && currentIndex === totalSlides;
  }

  _isGoingFromLastToFirst() {
    const { currentIndex, previousIndex } = this.state;
    const totalSlides = this.props.items!.length - 1;
    return previousIndex === totalSlides && currentIndex === 0;
  }

  _getTranslateXForTwoSlide(index) {
    const { thumbnailWidth = 0 } = this.props;

    // For taking care of infinite swipe when there are only two slides
    const { currentIndex, offsetPercentage, previousIndex } = this.state;
    const baseTranslateX = -thumbnailWidth * currentIndex;
    let translateX = baseTranslateX + index * thumbnailWidth + offsetPercentage;

    // keep track of user swiping direction
    if (offsetPercentage > 0) {
      this.direction = 'left';
    } else if (offsetPercentage < 0) {
      this.direction = 'right';
    }

    // when swiping make sure the slides are on the correct side
    if (currentIndex === 0 && index === 1 && offsetPercentage > 0) {
      translateX = -thumbnailWidth + offsetPercentage;
    } else if (currentIndex === 1 && index === 0 && offsetPercentage < 0) {
      translateX = thumbnailWidth + offsetPercentage;
    }

    if (currentIndex !== previousIndex) {
      // when swiped move the slide to the correct side
      if (
        previousIndex === 0 &&
        index === 0 &&
        offsetPercentage === 0 &&
        this.direction === 'left'
      ) {
        translateX = thumbnailWidth;
      } else if (
        previousIndex === 1 &&
        index === 1 &&
        offsetPercentage === 0 &&
        this.direction === 'right'
      ) {
        translateX = -thumbnailWidth;
      }
    } else {
      // keep the slide on the correct slide even when not a swipe
      if (
        currentIndex === 0 &&
        index === 1 &&
        offsetPercentage === 0 &&
        this.direction === 'left'
      ) {
        translateX = -thumbnailWidth;
      } else if (
        currentIndex === 1 &&
        index === 0 &&
        offsetPercentage === 0 &&
        this.direction === 'right'
      ) {
        translateX = thumbnailWidth;
      }
    }

    return translateX;
  }

  _getThumbnailBarHeight() {
    if (this._isThumbnailVertical()) {
      return {
        height: this.state.gallerySlideWrapperHeight
      };
    }
    return {};
  }

  _shouldPushSlideOnInfiniteMode(index) {
    /*
      Push(show) slide if slide is the current slide, and the next slide
      OR
      The slide is going more than 1 slide left, or right, but not going from
      first to last and not going from last to first

      There is an edge case where if you go to the first or last slide, when they're
      not left, or right of each other they will try to catch up in the background
      so unless were going from first to last or vice versa we don't want the first
      or last slide to show up during our transition
    */
    return (
      !this._slideIsTransitioning(index) ||
      (this._ignoreIsTransitioning() && !this._isFirstOrLastSlide(index))
    );
  }

  _slideIsTransitioning(index) {
    /*
    returns true if the gallery is transitioning and the index is not the
    previous or currentIndex
    */
    const { isTransitioning, previousIndex, currentIndex } = this.state;
    const indexIsNotPreviousOrNextSlide = !(index === previousIndex || index === currentIndex);
    return isTransitioning && indexIsNotPreviousOrNextSlide;
  }

  _isFirstOrLastSlide(index) {
    const totalSlides = this.props.items!.length - 1;
    const isLastSlide = index === totalSlides;
    const isFirstSlide = index === 0;
    return isLastSlide || isFirstSlide;
  }

  _ignoreIsTransitioning() {
    /*
      Ignore isTransitioning because were not going to sibling slides
      e.g. center to left or center to right
    */
    const { previousIndex, currentIndex } = this.state;
    const totalSlides = this.props.items!.length - 1;
    // we want to show the in between slides transition
    const slidingMoreThanOneSlideLeftOrRight = Math.abs(previousIndex - currentIndex) > 1;
    const notGoingFromFirstToLast = !(previousIndex === 0 && currentIndex === totalSlides);
    const notGoingFromLastToFirst = !(previousIndex === totalSlides && currentIndex === 0);

    return slidingMoreThanOneSlideLeftOrRight && notGoingFromFirstToLast && notGoingFromLastToFirst;
  }

  _getSlideStyle(index) {
    const { thumbnailWidth = 0 } = this.props;

    const { currentIndex, offsetPercentage } = this.state;
    const { infinite, items = [], useTranslate3D, isRTL } = this.props;
    const baseTranslateX = -thumbnailWidth * currentIndex;
    const totalSlides = items.length - 1;

    // calculates where the other slides belong based on currentIndex
    // if it is RTL the base line should be reversed
    let translateX =
      (baseTranslateX + index * thumbnailWidth) * (isRTL ? -1 : 1) + offsetPercentage;

    if (infinite && items.length > 2) {
      if (currentIndex === 0 && index === totalSlides) {
        // make the last slide the slide before the first
        // if it is RTL the base line should be reversed
        translateX = -thumbnailWidth * (isRTL ? -1 : 1) + offsetPercentage;
      } else if (currentIndex === totalSlides && index === 0) {
        // make the first slide the slide after the last
        // if it is RTL the base line should be reversed
        translateX = thumbnailWidth * (isRTL ? -1 : 1) + offsetPercentage;
      }
    }

    // Special case when there are only 2 items with infinite on
    if (infinite && items.length === 2) {
      translateX = this._getTranslateXForTwoSlide(index);
    }

    let translate = `translate(${translateX}%, 0)`;

    if (useTranslate3D) {
      translate = `translate3d(${translateX}%, 0, 0)`;
    }

    return {
      WebkitTransform: translate,
      MozTransform: translate,
      msTransform: translate,
      OTransform: translate,
      transform: translate
    };
  }

  _getThumbnailStyle() {
    let translate;
    const { useTranslate3D, isRTL } = this.props;
    const { thumbsTranslate } = this.state;
    const verticalTranslateValue = isRTL ? thumbsTranslate * -1 : thumbsTranslate;

    if (this._isThumbnailVertical()) {
      translate = `translate(0, ${thumbsTranslate}px)`;
      if (useTranslate3D) {
        translate = `translate3d(0, ${thumbsTranslate}px, 0)`;
      }
    } else {
      translate = `translate(${verticalTranslateValue}px, 0)`;
      if (useTranslate3D) {
        translate = `translate3d(${verticalTranslateValue}px, 0, 0)`;
      }
    }
    return {
      WebkitTransform: translate,
      MozTransform: translate,
      msTransform: translate,
      OTransform: translate,
      transform: translate
    };
  }

  _slideLeft = () => {
    this.props.isRTL ? this._slideNext() : this._slidePrevious();
  };

  _slideRight = () => {
    this.props.isRTL ? this._slidePrevious() : this._slideNext();
  };

  _slidePrevious = (event?) => {
    this.slideToIndex(this.state.currentIndex - 1, event);
  };

  _slideNext = (event?) => {
    this.slideToIndex(this.state.currentIndex + 1, event);
  };

  _renderItem = (item: Image) => {
    const onImageError = this.props.onImageError || this._handleImageError;

    return (
      <div className="fc-gallery-carousel-image">
        {item.imageSet ? (
          <picture onLoad={this.props.onImageLoad} onError={onImageError}>
            {item.imageSet.map((source, index) => (
              <source key={index} media={source.media} srcSet={source.srcSet} type={source.type} />
            ))}
            <img alt={item.alt} src={item.src} />
          </picture>
        ) : (
          <img
            src={item.src}
            alt={item.alt}
            srcSet={item.srcSet}
            sizes={item.sizes}
            title={item.title}
            onLoad={this.props.onImageLoad}
            onError={onImageError}
          />
        )}

        {item.description && (
          <span className="fc-gallery-carousel-description">{item.description}</span>
        )}
      </div>
    );
  };

  /** 渲染缩略图 */
  _renderThumbInner = (item: Image, index: number) => {
    const { onThumbnailError, onThumbnailDelete } = this.props;

    const _onThumbnailError = onThumbnailError || this._handleImageError;

    return (
      <div className="fc-gallery-carousel-thumbnail-inner">
        <img
          src={item.thumbnail}
          alt={item.alt}
          title={item.title}
          onError={_onThumbnailError}
          onDoubleClick={() => {
            this.setState({
              showLightbox: true,
              thumbnialImageIndex: index
            });
          }}
        />
        {item.thumbnailLabel && (
          <div className="fc-gallery-carousel-thumbnail-label">{item.thumbnailLabel}</div>
        )}
        {onThumbnailDelete && (
          <div className="fc-gallery-carousel-thumbnail-icons">
            <X
              onClick={() => {
                onThumbnailDelete(item);
              }}
            />
          </div>
        )}
      </div>
    );
  };

  _onThumbnailClick = (event, index) => {
    this.slideToIndex(index, event);
    if (this.props.onThumbnailClick) {
      this.props.onThumbnailClick(event, index);
    }
  };

  _onThumbnailMouseOver = (event, index) => {
    if (this._thumbnailMouseOverTimer) {
      window.clearTimeout(this._thumbnailMouseOverTimer);
      this._thumbnailMouseOverTimer = null;
    }
    this._thumbnailMouseOverTimer = window.setTimeout(() => {
      this.slideToIndex(index);
      this.pause();
    }, 300);
  };

  _onThumbnailMouseLeave = () => {
    if (this._thumbnailMouseOverTimer) {
      window.clearTimeout(this._thumbnailMouseOverTimer);
      this._thumbnailMouseOverTimer = null;
      if (this.props.autoPlay) {
        this.play();
      }
    }
  };

  render() {
    const { showSlider } = this.props;
    const { currentIndex, isFullscreen, modalFullscreen, isPlaying } = this.state;

    const { infinite, slideOnThumbnailOver, isRTL, lazyLoad } = this.props;

    const thumbnailStyle = this._getThumbnailStyle();
    const thumbnailPosition = this.props.thumbnailPosition;

    const slideLeft = this._slideLeft;
    const slideRight = this._slideRight;

    const slides: any = [];
    const thumbnails: any = [];
    const bullets: any = [];

    this.props.items!.forEach((item: Image, index) => {
      const alignment = this._getAlignmentClassName(index);
      const originalClass = item.className ? ` ${item.className}` : '';
      const thumbnailClass = item.thumbnailClassName ? ` ${item.thumbnailClassName}` : '';

      const renderItem = this.props.renderItem || this._renderItem;

      const renderThumbInner = this.props.renderThumbInner || this._renderThumbInner;

      const showItem = !lazyLoad || alignment || this._lazyLoaded[index];
      if (showItem && lazyLoad && !this._lazyLoaded[index]) {
        this._lazyLoaded[index] = true;
      }

      const slideStyle = this._getSlideStyle(index);

      const slide = (
        <div
          key={index}
          className={'fc-gallery-carousel-slide' + alignment + originalClass}
          style={Object.assign(slideStyle, this.state.style)}
          onClick={this.props.onClick}
          onTouchMove={this.props.onTouchMove}
          onTouchEnd={this.props.onTouchEnd}
          onTouchStart={this.props.onTouchStart}
          onMouseOver={this.props.onMouseOver}
          onMouseLeave={this.props.onMouseLeave}
          role={this.props.onClick && 'button'}
        >
          {showItem ? renderItem(item) : <div style={{ height: 'thumbnailWidth%' }}></div>}
        </div>
      );

      if (infinite) {
        // don't add some slides while transitioning to avoid background transitions
        if (this._shouldPushSlideOnInfiniteMode(index)) {
          slides.push(slide);
        }
      } else {
        slides.push(slide);
      }

      if (this.props.showThumbnails) {
        thumbnails.push(
          <a
            key={index}
            role="button"
            aria-pressed={currentIndex === index ? 'true' : 'false'}
            aria-label={`Go to Slide ${index + 1}`}
            className={
              'fc-gallery-carousel-thumbnail' +
              (currentIndex === index ? ' active' : '') +
              thumbnailClass
            }
            style={{
              flex: `0 0 ${this.props.thumbnailWidth}px`,
              width: this.props.thumbnailWidth,
              height: this.props.thumbnailHeight
            }}
            onMouseLeave={slideOnThumbnailOver ? this._onThumbnailMouseLeave : undefined}
            onMouseOver={event =>
              slideOnThumbnailOver ? this._onThumbnailMouseOver(event, index) : undefined
            }
            onClick={event => this._onThumbnailClick(event, index)}
          >
            {renderThumbInner(item, index)}
          </a>
        );
      }

      // 是否展示底层的圆点
      if (this.props.showBullets) {
        const bulletOnClick = event => {
          if (this.props.onBulletClick) {
            this.props.onBulletClick({ item, itemIndex: index, currentIndex });
          }
          return this.slideToIndex.call(this, index, event);
        };
        bullets.push(
          <button
            key={index}
            type="button"
            className={[
              'fc-gallery-carousel-bullet',
              currentIndex === index ? 'active' : '',
              item.bulletClass || ''
            ].join(' ')}
            onClick={bulletOnClick}
            aria-pressed={currentIndex === index ? 'true' : 'false'}
            aria-label={`Go to Slide ${index + 1}`}
          ></button>
        );
      }
    });

    const slideWrapper = (
      <div
        ref={this._initGalleryResizing}
        className={`fc-gallery-carousel-slide-wrapper ${thumbnailPosition} ${
          isRTL ? 'fc-gallery-carousel-rtl' : ''
        }`}
      >
        {showSlider && (
          <React.Fragment>
            {this.props.renderCustomControls && this.props.renderCustomControls()}

            {this.props.showFullscreenButton &&
              this.props.renderFullscreenButton(this._toggleFullScreen, isFullscreen)}

            {this.props.showPlayButton &&
              this.props.renderPlayPauseButton(this._togglePlay, isPlaying)}

            {this._canNavigate() ? (
              [
                this.props.showNav && (
                  <span key="navigation">
                    {this.props.renderLeftNav(slideLeft, !this._canSlideLeft())}
                    {this.props.renderRightNav(slideRight, !this._canSlideRight())}
                  </span>
                ),

                <Swipeable
                  className="fc-gallery-carousel-swipe"
                  key="swipeable"
                  delta={0}
                  onSwiping={this._handleSwiping}
                  onSwiped={this._handleOnSwiped}
                >
                  <div className="fc-gallery-carousel-slides">{slides}</div>
                </Swipeable>
              ]
            ) : (
              <div className="fc-gallery-carousel-slides">{slides}</div>
            )}

            {this.props.showBullets && (
              <div className="fc-gallery-carousel-bullets">
                <div
                  className="fc-gallery-carousel-bullets-container"
                  role="navigation"
                  aria-label="Bullet Navigation"
                >
                  {bullets}
                </div>
              </div>
            )}

            {this.props.showIndex && (
              <div className="fc-gallery-carousel-index">
                <span className="fc-gallery-carousel-index-current">
                  {this.state.currentIndex + 1}
                </span>
                <span className="fc-gallery-carousel-index-separator">
                  {this.props.indexSeparator}
                </span>
                <span className="fc-gallery-carousel-index-total">{this.props.items!.length}</span>
              </div>
            )}
          </React.Fragment>
        )}
      </div>
    );

    const classNames = [
      'fc-gallery-carousel',
      this.props.additionalClass,
      modalFullscreen ? 'fullscreen-modal' : ''
    ]
      .filter(name => typeof name === 'string')
      .join(' ');

    const { items = [] } = this.props;
    const { thumbnialImageIndex } = this.state;

    return (
      <div ref={i => (this._imageGallery = i)} className={classNames} aria-live="polite">
        <div className={`fc-gallery-carousel-content${isFullscreen ? ' fullscreen' : ''}`}>
          {(thumbnailPosition === 'bottom' || thumbnailPosition === 'right') && slideWrapper}

          {this.props.showThumbnails && (
            <div
              className={`fc-gallery-carousel-thumbnails-wrapper ${thumbnailPosition} ${
                !this._isThumbnailVertical() && isRTL ? 'thumbnails-wrapper-rtl' : ''
              }`}
              style={this._getThumbnailBarHeight()}
            >
              <div
                className="fc-gallery-carousel-thumbnails"
                ref={i => (this._thumbnailsWrapper = i)}
              >
                <div
                  ref={t => (this._thumbnails = t)}
                  className="fc-gallery-carousel-thumbnails-container"
                  style={{ height: (this.props.thumbnailHeight || 0) + 8, ...thumbnailStyle }}
                  aria-label="Thumbnail Navigation"
                >
                  {thumbnails}
                </div>
              </div>
            </div>
          )}

          {(thumbnailPosition === 'top' || thumbnailPosition === 'left') && slideWrapper}
        </div>

        {this.state.showLightbox && this.props.thumbnailWithLightbox && (
          <Lightbox
            mainSrc={items[thumbnialImageIndex].src || items[thumbnialImageIndex].thumbnail || ''}
            nextSrc={
              items[(thumbnialImageIndex + 1) % items.length].src ||
              items[(thumbnialImageIndex + 1) % items.length].thumbnail
            }
            prevSrc={
              items[(thumbnialImageIndex + items.length - 1) % items.length].src ||
              items[(thumbnialImageIndex + items.length - 1) % items.length].thumbnail
            }
            onCloseRequest={() => {
              this.setState({
                showLightbox: false
              });
            }}
            onMovePrevRequest={() =>
              this.setState({
                thumbnialImageIndex: (thumbnialImageIndex + items.length - 1) % items.length
              })
            }
            onMoveNextRequest={() =>
              this.setState({
                thumbnialImageIndex: (thumbnialImageIndex + items.length + 1) % items.length
              })
            }
          />
        )}
      </div>
    );
  }
}
