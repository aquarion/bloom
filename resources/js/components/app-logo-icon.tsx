import sprouter from "../../icons/sprouter-standard.svg";

export default function AppLogoIcon({
	className,
	...props
}: { className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
	return <img src={sprouter} alt="Sprouter" className={className} {...props} />;
}
