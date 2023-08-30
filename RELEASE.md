# Release a new version of ipyvue on PyPI and NPM:

- assert you have a remote called "upstream" pointing to git@github.com:widgetti/ipyvue.git
- assert you have an up-to-date and clean working directory on the branch master
- run `./release.sh [patch | minor | major]`

## Making an alpha release

    $ ./release.sh patch --new-version 1.19.0a1

## Recover from a failed release

If a release fails on CI, and you want to keep the history clean
```
# do fix
$ git rebase -i HEAD~3
$ git tag v1.19.0 -f &&  git push upstream master v1.19.0 -f
```
