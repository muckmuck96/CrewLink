import React, {
	Dispatch,
	ErrorInfo,
	ReactChild,
	SetStateAction,
	useEffect,
	useReducer,
	useState,
} from 'react';
import ReactDOM from 'react-dom';
import Voice from './Voice';
import Menu from './Menu';
import { ipcRenderer } from 'electron';
import { AmongUsState } from '../common/AmongUsState';
import Settings, {
	settingsReducer,
	lobbySettingsReducer,
} from './settings/Settings';
import {
	GameStateContext,
	SettingsContext,
	LobbySettingsContext,
} from './contexts';
import { makeStyles, ThemeProvider } from '@material-ui/core/styles';
import {
	IpcHandlerMessages,
	IpcMessages,
	IpcOverlayMessages,
	IpcRendererMessages,
	IpcSyncMessages,
} from '../common/ipc-messages';
import theme from './theme';
import SettingsIcon from '@material-ui/icons/Settings';
import CloseIcon from '@material-ui/icons/Close';
import IconButton from '@material-ui/core/IconButton';

let appVersion = '';
if (typeof window !== 'undefined' && window.location) {
	const query = new URLSearchParams(window.location.search.substring(1));
	appVersion = ' v' + query.get('version') || '';
}

const useStyles = makeStyles(() => ({
	root: {
		position: 'absolute',
		width: '100vw',
		height: theme.spacing(3),
		backgroundColor: '#1d1a23',
		top: 0,
		WebkitAppRegion: 'drag',
	},
	title: {
		width: '100%',
		textAlign: 'center',
		display: 'block',
		height: theme.spacing(3),
		lineHeight: `${theme.spacing(3)}px`,
		color: theme.palette.primary.main,
	},
	button: {
		WebkitAppRegion: 'no-drag',
		marginLeft: 'auto',
		padding: 0,
		position: 'absolute',
		top: 0,
	},
}));

interface TitleBarProps {
	settingsOpen: boolean;
	setSettingsOpen: Dispatch<SetStateAction<boolean>>;
}

const TitleBar: React.FC<TitleBarProps> = function ({
	settingsOpen,
	setSettingsOpen,
}: TitleBarProps) {
	const classes = useStyles();
	return (
		<div className={classes.root}>
			<span className={classes.title}>CrewLink{appVersion}</span>
			<IconButton
				className={classes.button}
				style={{ left: 0 }}
				size="small"
				onClick={() => setSettingsOpen(!settingsOpen)}
			>
				<SettingsIcon htmlColor="#777" />
			</IconButton>
			<IconButton
				className={classes.button}
				style={{ right: 0 }}
				size="small"
				onClick={() => ipcRenderer.send(IpcMessages.QUIT_CREWLINK)}
			>
				<CloseIcon htmlColor="#777" />
			</IconButton>
		</div>
	);
};

enum AppState {
	MENU,
	VOICE,
}

interface ErrorBoundaryProps {
	children: ReactChild;
}
interface ErrorBoundaryState {
	error?: Error;
}

class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = {};
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		// Update state so the next render will show the fallback UI.
		return { error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('React Error: ', error, errorInfo);
	}

	render(): ReactChild {
		if (this.state.error) {
			return (
				<div style={{ paddingTop: 16 }}>
					<Typography align="center" variant="h6" color="error">
						REACT ERROR
					</Typography>
					<Typography
						align="center"
						style={{
							whiteSpace: 'pre-wrap',
							fontSize: 12,
							maxHeight: 200,
							overflowY: 'auto',
						}}
					>
						{this.state.error.stack}
					</Typography>
					<SupportLink />
					<Button
						style={{ margin: '10px auto', display: 'block' }}
						variant="contained"
						color="secondary"
						onClick={() => window.location.reload()}
					>
						Reload App
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}

const App: React.FC = function () {
	const [state, setState] = useState<AppState>(AppState.MENU);
	const [gameState, setGameState] = useState<AmongUsState>({} as AmongUsState);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [error, setError] = useState('');
	const settings = useReducer(settingsReducer, {
		alwaysOnTop: false,
		microphone: 'Default',
		speaker: 'Default',
		pushToTalk: false,
		serverURL: 'http://195.201.36.166:9736',
		pushToTalkShortcut: 'V',
		deafenShortcut: 'RControl',
		muteShortcut: 'RAlt',
		hideCode: false,
		enableSpatialAudio: true,
		meetingOverlay: true,
		overlayPosition: 'right',
		localLobbySettings: {
			maxDistance: 5.32,
			haunting: false,
			hearImpostorsInVents: false,
			commsSabotage: true,
		},
	});
	const lobbySettings = useReducer(
		lobbySettingsReducer,
		settings[0].localLobbySettings
	);

	useEffect(() => {
		const onOpen = (_: Electron.IpcRendererEvent, isOpen: boolean) => {
			setState(isOpen ? AppState.VOICE : AppState.MENU);
		};
		const onState = (_: Electron.IpcRendererEvent, newState: AmongUsState) => {
			setGameState(newState);
		};
		const onError = (_: Electron.IpcRendererEvent, error: string) => {
			shouldInit = false;
			setError(error);
		};
		let shouldInit = true;
		ipcRenderer
			.invoke(IpcHandlerMessages.START_HOOK)
			.then(() => {
				if (shouldInit) {
					setGameState(ipcRenderer.sendSync(IpcSyncMessages.GET_INITIAL_STATE));
				}
			})
			.catch((error: Error) => {
				if (shouldInit) {
					shouldInit = false;
					setError(error.message);
				}
			});
		ipcRenderer.on(IpcRendererMessages.NOTIFY_GAME_OPENED, onOpen);
		ipcRenderer.on(IpcRendererMessages.NOTIFY_GAME_STATE_CHANGED, onState);
		ipcRenderer.on(IpcRendererMessages.ERROR, onError);
		return () => {
			ipcRenderer.off(IpcRendererMessages.NOTIFY_GAME_OPENED, onOpen);
			ipcRenderer.off(IpcRendererMessages.NOTIFY_GAME_STATE_CHANGED, onState);
			ipcRenderer.off(IpcRendererMessages.ERROR, onError);
			shouldInit = false;
		};
	}, []);

	useEffect(() => {
		ipcRenderer.send(
			IpcMessages.SEND_TO_OVERLAY,
			IpcOverlayMessages.NOTIFY_GAME_STATE_CHANGED,
			gameState
		);
	}, [gameState]);

	useEffect(() => {
		ipcRenderer.send(
			IpcMessages.SEND_TO_OVERLAY,
			IpcOverlayMessages.NOTIFY_SETTINGS_CHANGED,
			settings[0]
		);
	}, [settings]);

	let page;
	switch (state) {
		case AppState.MENU:
			page = <Menu error={error} />;
			break;
		case AppState.VOICE:
			page = <Voice error={error} />;
			break;
	}

	return (
		<GameStateContext.Provider value={gameState}>
			<LobbySettingsContext.Provider value={lobbySettings}>
				<SettingsContext.Provider value={settings}>
					<ThemeProvider theme={theme}>
						<TitleBar
							settingsOpen={settingsOpen}
							setSettingsOpen={setSettingsOpen}
						/>
						<Settings
							open={settingsOpen}
							onClose={() => setSettingsOpen(false)}
						/>
						{page}
					</ThemeProvider>
				</SettingsContext.Provider>
			</LobbySettingsContext.Provider>
		</GameStateContext.Provider>
	);
};

ReactDOM.render(<App />, document.getElementById('app'));
