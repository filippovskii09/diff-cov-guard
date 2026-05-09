import { ENV_TYPES } from "./constants.js"

export const getEnvironment  = () => {
	if(process.env.GITHUB_ACTIONS) {
		return {
			type: ENV_TYPES.GITHUB,
			isCI: true,
			baseBranch: process.env.GITHUB_BASE_REF,
			currentBranch: process.env.GITHUB_REF_NAME,
		}
	}
	
	if(process.env.GITLAB_CI) {
		return {
			type: ENV_TYPES.GITLAB,
			isCI: true,
			baseBranch: process.env.GITLAB_COMMIT_BEFORE,
			currentBranch: process.env.GITLAB_COMMIT_REF_NAME,
		}
	}

	return {
		type: ENV_TYPES.LOCAL,
		isCI: false,
		baseBranch: null,
		currentBranch: null,
	}
}
