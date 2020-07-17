// @flow

import type { Node } from 'react'
import * as React from 'react'
import styled, { keyframes, css } from 'styled-components'

const UPWARDS = 'up'
const DOWNWARDS = 'down'

const UNPINNED = 'unpinned'
const PINNED = 'pinned'
const STATIC = 'static'

const NO_TRANSITION = 'none'
const NORMAL_TRANSITION = 'normal'
const PINNED_TO_STATIC = 'pinned-to-static';

type ModeType = 'pinned' | 'unpinned' | 'static';
type DirectionType = 'up' | 'down';
type TransitionType = 'none' | 'normal' | 'pinned-to-static';

type PropsType = {|
	/** The child node to be displayed as a header */
	children: Node,
	/** The maximum amount of px the header should move up when scrolling */
	scrollHeight: number,
	/** The minimum scrollTop position where the transform should start */
	pinStart: number,
	/** Used for calculating the stickyTop position of an ancestor */
	height?: number,
	/** Fired, when Headroom changes its state. Passes stickyTop of the ancestor. */
	onStickyTopChanged?: (number) => void,
	/** True, if sticky position should be disabled (e.g. for edge 16 support) */
	positionStickyDisabled?: boolean
|};

type StateType = {|
	mode: ModeType,
	transition: TransitionType,
	animateUpFrom: ?number
|};

const HeaderWrapper = styled.div.attrs(props => ({
	className: `${
		props.static
		?
		props.classInit
		:
		props.classFlow
	}`
}))`
	position: ${props => props.positionStickyDisabled ? 'static' : 'sticky'};
	top: ${props => props.top}px;
	z-index: 1;
	transform: translateY(${props => props.translateY}px);
	animation-duration: 0.2s;
	animation-timing-function: ease-out;
	${props => props.transition === NORMAL_TRANSITION && !props.static
		? 'transition: transform 0.2s ease-out;' : ''}
	${props => props.transition === PINNED_TO_STATIC ? css`
		animation-name: ${keyframesMoveUpFrom(props.animateUpFrom)};
	` : ''}
	${props => props.static ? 'transition: none;' : ''}
`;

const keyframesMoveUpFrom = (from: number) => keyframes`
		from {
			transform: translateY(${Math.max(from, 0)}px)
		}

		to {
			transform: translateY(0)
		}
	`;

class Headroom extends React.PureComponent<PropsType, StateType> {
	static defaultProps = {
		pinStart: 0
	}

	state = { mode: STATIC, transition: NO_TRANSITION, animateUpFrom: null }

	/** the very last scrollTop which we know about (to determine direction changes) */
	lastKnownScrollTop = 0

	/**
	 * @returns {number} the current scrollTop position of the window
	 */
	static getScrollTop (): number {
		if (window.pageYOffset !== undefined) {
			return window.pageYOffset
		} else if (window.scrollTop !== undefined) {
			return window.scrollTop
		} else if (document.documentElement) {
			return document.documentElement.scrollTop
		} else if (document.body) {
			return document.body.scrollTop
		} else {
			throw new Error('Could not determine scrollTop!')
		}
	}

	componentDidMount () {
		window.addEventListener('scroll', this.handleEvent)
	}

	componentWillUnmount () {
		window.removeEventListener('scroll', this.handleEvent)
	}

	/**
	 * If we're already static and pinStart + scrollHeight >= scrollTop, then we should stay static.
	 * If we're not already static, then we should set the header static, only when pinStart >= scrollTop (regardless of
	 * scrollHeight, so the header doesn't jump up, when scrolling upwards to the trigger).
	 * Else we shouldn't set it static.
	 * @param scrollTop the currentScrollTop position
	 * @param direction the current direction
	 * @returns {boolean} if we should set the header static
	 */
	shouldSetStatic (scrollTop: number, direction: DirectionType): boolean {
		if (this.state.mode === STATIC || (this.state.mode === PINNED && direction ===
				DOWNWARDS)) {
			return this.props.pinStart + this.props.scrollHeight >= scrollTop
		} else {
			return this.props.pinStart >= scrollTop
		}
	}

	/**
	 * Determines the mode depending on the scrollTop position and the current direction
	 * @param {number} scrollTop
	 * @param {string} direction
	 * @returns {string} the next mode of Headroom
	 */
	determineMode (scrollTop: number, direction: DirectionType): ModeType {
		if (this.shouldSetStatic(scrollTop, direction)) {
			return STATIC
		} else {
			return direction === UPWARDS ? PINNED : UNPINNED
		}
	}

	/**
	 * @returns {TransitionType} determines the kind of transition
	 */
	determineTransition (mode: ModeType,
		direction: DirectionType): TransitionType {
		// Handle special case: If we're pinned and going to static, we need a special transition using css animation
		if (this.state.mode === PINNED && mode === STATIC) {
			return PINNED_TO_STATIC
		}
		// If mode is static, then no transition, because we're already in the right spot
		// (and want to change transform and top properties seamlessly)
		if (mode === STATIC) {
			return this.state.transition === NO_TRANSITION ? NO_TRANSITION
				: PINNED_TO_STATIC
		}
		// mode is not static, transition when moving upwards or when we've lastly did the transition
		return direction === UPWARDS || this.state.transition === NORMAL_TRANSITION
			? NORMAL_TRANSITION : NO_TRANSITION
	}

	/**
	 * Checks the current scrollTop position and updates the state accordingly
	 */
	update = () => {
		const currentScrollTop = Headroom.getScrollTop()
		const newState = {}
		if (currentScrollTop === this.lastKnownScrollTop) {
			return
		}
		const direction = this.lastKnownScrollTop < currentScrollTop ? DOWNWARDS
			: UPWARDS
		newState.mode = this.determineMode(currentScrollTop, direction)
		newState.transition = this.determineTransition(newState.mode, direction)

		const { onStickyTopChanged, height, scrollHeight, pinStart } = this.props
		if (this.state.mode === PINNED && newState.mode === STATIC) {
			// animation in the special case from pinned to static
			newState.animateUpFrom = currentScrollTop - pinStart
		}
		if (onStickyTopChanged && newState.mode !== this.state.mode && height) {
			onStickyTopChanged(Headroom.calcStickyTop(newState.mode, height, scrollHeight))
		}
		this.setState(newState)
		this.lastKnownScrollTop = currentScrollTop
	}

	handleEvent = () => {
		window.requestAnimationFrame(this.update)
	}

	static calcStickyTop (
		mode: ModeType,
		height: number,
		scrollHeight: number
	): number {
		return mode === PINNED ? height : height - scrollHeight
	}

	render () {
		const {
			children,
			scrollHeight,
			positionStickyDisabled,
			classInit,
			classFlow,
		} = this.props
		const { mode, transition, animateUpFrom } = this.state
		const transform = mode === UNPINNED ? -scrollHeight : 0
		const ownStickyTop = mode === STATIC ? -scrollHeight : 0
		return (
			<>
				<HeaderWrapper
						classInit={classInit}
						classFlow={classFlow}
						top={ownStickyTop}
						transition={transition}
						positionStickyDisabled={positionStickyDisabled}
						static={mode === STATIC}
						animateUpFrom={animateUpFrom}>
					{children}
				</HeaderWrapper>
			</>
		)
	}
}

export default Headroom
