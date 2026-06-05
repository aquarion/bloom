import bloom from "../../icons/bloom-standard.svg";

export default function AppLogoIcon({
	className,
	...props
}: { className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
	return <img src={bloom} alt="Bloom" className={className} {...props} />;
}
