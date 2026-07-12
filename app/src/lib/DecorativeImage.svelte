<!-- Ornamental figure in the viewport's left gutter. The wrapper's right edge
     stops where the widest content column (max-w-6xl + px-4, the parallel
     reader) begins, so the figure can never underlap text: it shrinks with the
     gutter and disappears (container query) once the gutter is too narrow to
     read as art rather than a sliver. -->
<div class="decorative-gutter pointer-events-none fixed bottom-0 left-0 hidden xl:block" aria-hidden="true">
	<img src="/francis-praying.png" alt="" />
</div>

<style>
	.decorative-gutter {
		right: calc(50% + 36rem + 1rem);
		container-type: inline-size;
	}
	.decorative-gutter img {
		display: none;
		max-height: 50vh;
		max-width: 100%;
		width: auto;
		height: auto;
		opacity: 0.8;
	}
	@container (min-width: 7rem) {
		.decorative-gutter img {
			display: block;
		}
	}
</style>
